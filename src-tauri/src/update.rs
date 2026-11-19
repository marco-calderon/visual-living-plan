//! The app updates itself from GitHub releases (ADR 0041), and shows it in the window (ADR 0042).
//!
//! Each release carries one signed `.app.tar.gz` per Mac architecture and a `latest.json` that
//! names them (`scripts/updater-manifest.ts`). The app reads
//! `releases/latest/download/latest.json` a little after launch and every few hours. When that
//! names a newer version, it downloads the package, checks its signature, swaps the `.app` on
//! disk, and offers to restart. Later leaves the new version for the next launch. The plan service
//! runs detached, so a restart does not interrupt agents.
//!
//! What the updater is doing is a [`Notice`]. The app's notices script (`src/desktopNotices.ts`,
//! run in every window) draws it as a toast that stays while the update needs it: the download's
//! progress, then Restart now and Later. A page that loads while a download runs, or while an update
//! waits, gets the notice again. Its buttons are `living-plan://update/...` links, which reach
//! [`act`] only from inside an app window, and each does something only when this state agrees.
//!
//! Living Plan > Check for Updates…, and Check for updates in Settings, check on request. They
//! answer in the window they were used from: checking, up to date, or why the check failed.
//!
//! The package is checked against `plugins.updater.pubkey` in `tauri.conf.json`, and the version
//! its signature carries must be the one `latest.json` announces (`requireSignedVersion`), so a
//! changed manifest cannot install an older release. A build with no public key, and a debug
//! build, never checks.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_updater::{Error as UpdaterError, UpdaterExt};

use crate::app_link::UpdateAction;

/// The menu item that checks on request.
pub const MENU_ID: &str = "check-for-updates";

/// The first check waits until the window and the plan service have had the launch to themselves.
const FIRST_CHECK_AFTER: Duration = Duration::from_secs(30);

/// The app can stay open for days.
const CHECK_EVERY: Duration = Duration::from_secs(6 * 60 * 60);

/// The download's notice moves at most this often. Every window gets each move.
const PROGRESS_EVERY: Duration = Duration::from_millis(150);

/// What the updater shows. `src/desktopNotices.ts` has the same shape as `UpdateNotice`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "stage", rename_all = "camelCase")]
pub enum Notice {
    Checking,
    Downloading {
        version: String,
        received: u64,
        total: Option<u64>,
    },
    Installing {
        version: String,
    },
    Ready {
        version: String,
    },
    Current {
        version: String,
    },
    Failed {
        message: String,
        retry: bool,
    },
}

impl Notice {
    /// Notices that stay until the update moves on. A page that loads meanwhile shows them again.
    /// The others answer one check, once.
    fn lasting(&self) -> bool {
        matches!(
            self,
            Notice::Downloading { .. } | Notice::Installing { .. } | Notice::Ready { .. }
        )
    }

    /// Two notices of the same step of the same update. Hiding one hides the step.
    fn same_step(&self, other: &Notice) -> bool {
        match (self, other) {
            (Notice::Downloading { version: a, .. }, Notice::Downloading { version: b, .. })
            | (Notice::Installing { version: a }, Notice::Installing { version: b })
            | (Notice::Ready { version: a }, Notice::Ready { version: b }) => a == b,
            _ => false,
        }
    }
}

/// The lasting notice and whether the person hid it.
#[derive(Debug, Default)]
struct Shown {
    notice: Option<Notice>,
    hidden: bool,
}

impl Shown {
    /// Put up `next`. Returns what every window should show now, or `None` when nothing changes for
    /// them. A new step shows even if the one before it was hidden.
    fn set(&mut self, next: Option<Notice>) -> Option<Option<Notice>> {
        let same_step = match (&self.notice, &next) {
            (Some(current), Some(next)) => current.same_step(next),
            (None, None) => true,
            _ => false,
        };
        if !same_step {
            self.hidden = false;
        }
        self.notice = next.clone();
        if self.hidden {
            None
        } else {
            Some(next)
        }
    }

    /// Hide the notice when it is the step a button named. Returns true when it was hidden now.
    fn hide(&mut self, step: impl Fn(&Notice) -> bool) -> bool {
        if self.hidden || !self.notice.as_ref().is_some_and(step) {
            return false;
        }
        self.hidden = true;
        true
    }

    /// The notice a page that just loaded should show.
    fn for_new_page(&self) -> Option<Notice> {
        if self.hidden {
            None
        } else {
            self.notice.clone().filter(Notice::lasting)
        }
    }
}

#[derive(Default)]
pub struct Updates {
    /// A check or download is running.
    busy: AtomicBool,
    /// The version installed on disk, waiting for a restart.
    installed: Mutex<Option<String>>,
    shown: Mutex<Shown>,
}

/// Where a check was asked for: the window of the menu or Settings, or the timer. Only an asked
/// check says that it is checking, that the app is current, or that the check failed.
#[derive(Clone, PartialEq, Eq)]
enum Asked {
    In(String),
    No,
}

enum Outcome {
    Current,
    /// `fresh` is false when this version was installed by an earlier check.
    Installed {
        version: String,
        fresh: bool,
    },
}

/// Counts a download and says when its notice should move: at most every [`PROGRESS_EVERY`], and
/// at the end.
#[derive(Debug, Default)]
pub struct Progress {
    received: u64,
    sent_at: Option<Instant>,
}

impl Progress {
    /// Add a chunk. Returns the bytes so far when the notice should show them.
    pub fn advance(&mut self, chunk: usize, total: Option<u64>, now: Instant) -> Option<u64> {
        self.received = self.received.saturating_add(chunk as u64);
        let due = self
            .sent_at
            .is_none_or(|sent| now.duration_since(sent) >= PROGRESS_EVERY);
        let done = total.is_some_and(|total| self.received >= total);
        if due || done {
            self.sent_at = Some(now);
            Some(self.received)
        } else {
            None
        }
    }
}

/// Whether `plugins.updater` carries a public key. Without one there is nothing to check
/// downloads against, so the app does not check at all.
pub fn has_public_key(updater: Option<&Value>) -> bool {
    updater
        .and_then(|config| config.get("pubkey"))
        .and_then(Value::as_str)
        .is_some_and(|key| !key.trim().is_empty())
}

/// Why this build does not update itself, or `None` when it does. Updates run in release builds
/// for macOS that carry the updater's public key. Releases only ship Mac packages, and a debug
/// build is a checkout, not an install.
fn off_because(app: &AppHandle) -> Option<&'static str> {
    if !cfg!(target_os = "macos") {
        Some("Living Plan updates itself on macOS. Install a newer version from the GitHub releases.")
    } else if cfg!(debug_assertions) {
        Some("A development build does not update itself.")
    } else if !has_public_key(app.config().plugins.0.get("updater")) {
        Some("This build has no update key, so it does not update itself.")
    } else {
        None
    }
}

pub fn enabled(app: &AppHandle) -> bool {
    off_because(app).is_none()
}

/// The script that shows `notice` (or takes it away) in a page that runs the notices script.
fn update_script(notice: Option<&Notice>) -> String {
    let json = serde_json::to_string(&notice).unwrap_or_else(|_| "null".into());
    format!("window.__LIVING_PLAN_NOTICES__&&window.__LIVING_PLAN_NOTICES__.update({json})")
}

fn show_in(window: &WebviewWindow, notice: Option<&Notice>) {
    if !crate::shows_notices(window) {
        return;
    }
    if let Err(error) = window.eval(update_script(notice)) {
        eprintln!("Living Plan: could not show the update notice: {error}");
    }
}

fn show_everywhere(app: &AppHandle, notice: Option<&Notice>) {
    for window in app.webview_windows().into_values() {
        show_in(&window, notice);
    }
}

/// Answer an asked check in the window it was asked from.
fn tell(app: &AppHandle, asked: &Asked, notice: Notice) {
    let Asked::In(label) = asked else { return };
    if let Some(window) = app.get_webview_window(label) {
        show_in(&window, Some(&notice));
    }
}

impl Updates {
    /// Put up a lasting notice, or take it away, in every window.
    fn set(&self, app: &AppHandle, notice: Option<Notice>) {
        let shown = self.shown.lock().map(|mut shown| shown.set(notice));
        if let Ok(Some(now)) = shown {
            show_everywhere(app, now.as_ref());
        }
    }

    /// Show the lasting notice again where it was hidden, or `notice` in its place. Returns false
    /// when there is nothing to show.
    fn reveal(&self, app: &AppHandle, notice: Option<Notice>) -> bool {
        let notice = self.shown.lock().ok().and_then(|mut shown| {
            if notice.is_some() {
                shown.notice = notice;
            }
            shown.hidden = false;
            shown.notice.clone()
        });
        match notice {
            Some(notice) => {
                show_everywhere(app, Some(&notice));
                true
            }
            None => false,
        }
    }

    /// Clear the lasting notice without telling the windows. Returns true when it was a download,
    /// whose toast the next notice replaces.
    fn clear_download(&self) -> bool {
        self.shown
            .lock()
            .map(|mut shown| {
                let downloading = matches!(
                    shown.notice,
                    Some(Notice::Downloading { .. } | Notice::Installing { .. })
                );
                *shown = Shown::default();
                downloading
            })
            .unwrap_or(false)
    }

    fn hide(&self, app: &AppHandle, step: impl Fn(&Notice) -> bool) {
        let hidden = self
            .shown
            .lock()
            .map(|mut shown| shown.hide(step))
            .unwrap_or(false);
        if hidden {
            show_everywhere(app, None);
        }
    }

    fn installed(&self) -> Option<String> {
        self.installed.lock().ok().and_then(|guard| guard.clone())
    }
}

/// A page finished loading in `window`: give it the lasting notice, if there is one.
pub fn on_page_load(app: &AppHandle, window: &WebviewWindow) {
    let notice = app
        .state::<Updates>()
        .shown
        .lock()
        .ok()
        .and_then(|shown| shown.for_new_page());
    if let Some(notice) = notice {
        show_in(window, Some(&notice));
    }
}

/// A button in the notice, or Check for updates in Settings, from the window `label`.
pub fn act(app: &AppHandle, label: &str, action: UpdateAction) {
    let updates = app.state::<Updates>();
    match action {
        UpdateAction::Check => check_now(app, label),
        UpdateAction::Restart => {
            // A page can follow this link at any time. Only an installed update restarts the app.
            if updates.installed().is_some() {
                app.request_restart();
            }
        }
        UpdateAction::Later => updates.hide(app, |notice| matches!(notice, Notice::Ready { .. })),
        UpdateAction::Hide => updates.hide(app, |notice| {
            matches!(
                notice,
                Notice::Downloading { .. } | Notice::Installing { .. }
            )
        }),
    }
}

/// Check a little after launch and then every few hours, on a thread of its own.
pub fn watch(app: &AppHandle) {
    if !enabled(app) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(FIRST_CHECK_AFTER);
        loop {
            tauri::async_runtime::block_on(run(app.clone(), Asked::No));
            std::thread::sleep(CHECK_EVERY);
        }
    });
}

/// Check now, and answer in the window `label`: the menu's front window, or the one whose Settings
/// asked.
pub fn check_now(app: &AppHandle, label: &str) {
    tauri::async_runtime::spawn(run(app.clone(), Asked::In(label.to_string())));
}

async fn run(app: AppHandle, asked: Asked) {
    if let Some(reason) = off_because(&app) {
        tell(
            &app,
            &asked,
            Notice::Failed {
                message: reason.to_string(),
                retry: false,
            },
        );
        return;
    }
    let updates = app.state::<Updates>();
    if updates.busy.swap(true, Ordering::SeqCst) {
        // A check or download is running. Asked again, show where it is.
        if asked != Asked::No && !updates.reveal(&app, None) {
            tell(&app, &asked, Notice::Checking);
        }
        return;
    }
    tell(&app, &asked, Notice::Checking);
    let outcome = check_and_install(&app, &updates).await;
    updates.busy.store(false, Ordering::SeqCst);

    match outcome {
        Ok(Outcome::Installed { version, fresh }) => {
            if fresh {
                updates.set(&app, Some(Notice::Ready { version }));
            } else if asked != Asked::No {
                // Installed by an earlier check, and perhaps hidden with Later: show it again.
                updates.reveal(&app, Some(Notice::Ready { version }));
            }
        }
        Ok(Outcome::Current) => {
            let version = app.package_info().version.to_string();
            tell(&app, &asked, Notice::Current { version });
        }
        Err(error) => {
            eprintln!("Living Plan: update failed: {error}");
            let failed = Notice::Failed {
                message: describe(&error),
                retry: retryable(&error),
            };
            // A download that started ends with the reason in every window, in place of its
            // progress. A check that showed nothing answers only when it was asked for.
            if updates.clear_download() {
                show_everywhere(&app, Some(&failed));
            } else {
                tell(&app, &asked, failed);
            }
        }
    }
}

async fn check_and_install(app: &AppHandle, updates: &Updates) -> Result<Outcome, UpdaterError> {
    let Some(update) = app.updater()?.check().await? else {
        return Ok(Outcome::Current);
    };
    let version = update.version.clone();
    // The running app keeps its old version until it restarts, so every later check finds the
    // same release again. It is on disk already.
    if updates.installed().as_deref() == Some(version.as_str()) {
        return Ok(Outcome::Installed {
            version,
            fresh: false,
        });
    }

    eprintln!(
        "Living Plan: installing {version} over {}",
        update.current_version
    );
    updates.set(
        app,
        Some(Notice::Downloading {
            version: version.clone(),
            received: 0,
            total: None,
        }),
    );
    let mut progress = Progress::default();
    let (on_chunk, on_done) = (app.clone(), app.clone());
    let (chunk_version, done_version) = (version.clone(), version.clone());
    update
        .download_and_install(
            move |chunk, total| {
                if let Some(received) = progress.advance(chunk, total, Instant::now()) {
                    on_chunk.state::<Updates>().set(
                        &on_chunk,
                        Some(Notice::Downloading {
                            version: chunk_version.clone(),
                            received,
                            total,
                        }),
                    );
                }
            },
            move || {
                on_done.state::<Updates>().set(
                    &on_done,
                    Some(Notice::Installing {
                        version: done_version,
                    }),
                );
            },
        )
        .await?;
    if let Ok(mut installed) = updates.installed.lock() {
        *installed = Some(version.clone());
    }
    Ok(Outcome::Installed {
        version,
        fresh: true,
    })
}

/// What a failed check or download says.
fn describe(error: &UpdaterError) -> String {
    match error {
        // The newest release has no `latest.json` yet: its Mac builds are still running, or that
        // release was made without the updater key.
        UpdaterError::ReleaseNotFound => {
            "The latest release has no update for this app yet. Try again in a few minutes."
                .to_string()
        }
        UpdaterError::Reqwest(_) | UpdaterError::Network(_) => {
            "Could not reach GitHub to check for updates. Check the connection and try again."
                .to_string()
        }
        UpdaterError::Minisign(_)
        | UpdaterError::SignedVersionMismatch { .. }
        | UpdaterError::MissingSignedVersion => format!(
            "The update was not installed because its signature did not check out ({error})."
        ),
        _ => format!("Could not update Living Plan: {error}"),
    }
}

/// A signature that does not check out will not check out on the next try either.
fn retryable(error: &UpdaterError) -> bool {
    !matches!(
        error,
        UpdaterError::Minisign(_)
            | UpdaterError::SignedVersionMismatch { .. }
            | UpdaterError::MissingSignedVersion
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn downloading(received: u64) -> Notice {
        Notice::Downloading {
            version: "2.32.0".into(),
            received,
            total: Some(100),
        }
    }

    fn ready() -> Notice {
        Notice::Ready {
            version: "2.32.0".into(),
        }
    }

    #[test]
    fn checks_only_with_a_public_key() {
        assert!(!has_public_key(None));
        assert!(!has_public_key(Some(&json!({}))));
        assert!(!has_public_key(Some(&json!({ "pubkey": "" }))));
        assert!(!has_public_key(Some(&json!({ "pubkey": "  " }))));
        assert!(!has_public_key(Some(&json!({ "pubkey": 1 }))));
        assert!(has_public_key(Some(
            &json!({ "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6" })
        )));
    }

    #[test]
    fn notices_have_the_shape_the_page_reads() {
        assert_eq!(
            serde_json::to_value(downloading(40)).unwrap(),
            json!({ "stage": "downloading", "version": "2.32.0", "received": 40, "total": 100 })
        );
        assert_eq!(
            serde_json::to_value(Notice::Checking).unwrap(),
            json!({ "stage": "checking" })
        );
        assert_eq!(
            serde_json::to_value(Notice::Failed {
                message: "Offline.".into(),
                retry: true
            })
            .unwrap(),
            json!({ "stage": "failed", "message": "Offline.", "retry": true })
        );
        assert_eq!(
            update_script(Some(&ready())),
            r#"window.__LIVING_PLAN_NOTICES__&&window.__LIVING_PLAN_NOTICES__.update({"stage":"ready","version":"2.32.0"})"#
        );
        assert_eq!(
            update_script(None),
            "window.__LIVING_PLAN_NOTICES__&&window.__LIVING_PLAN_NOTICES__.update(null)"
        );
        // Text from an error stays a string literal.
        let script = update_script(Some(&Notice::Failed {
            message: "\"});alert(1);({\"".into(),
            retry: false,
        }));
        assert!(script.contains(r#""message":"\"});alert(1);({\"""#));
    }

    #[test]
    fn a_hidden_step_stays_hidden_until_the_next_one() {
        let mut shown = Shown::default();
        assert_eq!(shown.set(Some(downloading(0))), Some(Some(downloading(0))));
        assert!(shown.hide(|notice| matches!(notice, Notice::Downloading { .. })));
        // Hiding twice does nothing more.
        assert!(!shown.hide(|notice| matches!(notice, Notice::Downloading { .. })));
        assert_eq!(shown.for_new_page(), None);
        // The rest of the download stays out of sight.
        assert_eq!(shown.set(Some(downloading(60))), None);
        // The update is ready: a new step shows again.
        assert_eq!(shown.set(Some(ready())), Some(Some(ready())));
        assert_eq!(shown.for_new_page(), Some(ready()));
        // Later on a notice that is not Ready changes nothing.
        let mut other = Shown::default();
        other.set(Some(downloading(0)));
        assert!(!other.hide(|notice| matches!(notice, Notice::Ready { .. })));
        assert_eq!(other.for_new_page(), Some(downloading(0)));
    }

    #[test]
    fn only_update_steps_last() {
        assert!(downloading(0).lasting());
        assert!(ready().lasting());
        assert!(!Notice::Checking.lasting());
        assert!(!Notice::Current {
            version: "2.32.0".into()
        }
        .lasting());
        assert!(!downloading(0).same_step(&Notice::Downloading {
            version: "2.33.0".into(),
            received: 0,
            total: None
        }));
    }

    #[test]
    fn the_download_moves_at_most_every_little_while_and_at_the_end() {
        let start = Instant::now();
        let mut progress = Progress::default();
        assert_eq!(progress.advance(10, Some(100), start), Some(10));
        assert_eq!(
            progress.advance(10, Some(100), start + Duration::from_millis(50)),
            None
        );
        assert_eq!(
            progress.advance(10, Some(100), start + PROGRESS_EVERY),
            Some(30)
        );
        assert_eq!(
            progress.advance(70, Some(100), start + PROGRESS_EVERY),
            Some(100)
        );
        // Without a size, only time moves it.
        let mut no_size = Progress::default();
        assert_eq!(no_size.advance(5, None, start), Some(5));
        assert_eq!(no_size.advance(5, None, start), None);
    }

    #[test]
    fn a_bad_signature_is_not_offered_again() {
        assert!(!retryable(&UpdaterError::MissingSignedVersion));
        assert!(retryable(&UpdaterError::ReleaseNotFound));
    }

    #[test]
    fn the_shipped_config_deserializes_for_the_plugin() {
        // The plugin refuses to start, and with it the app, when `plugins.updater` has no
        // `pubkey` field, even an empty one.
        let config: Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let updater = config["plugins"]["updater"].clone();
        assert!(updater["pubkey"].is_string());
        serde_json::from_value::<tauri_plugin_updater::Config>(updater).unwrap();
    }

    #[test]
    fn the_shipped_public_key_decodes() {
        use base64::Engine;
        // An empty key turns updates off in that build, and is allowed. Any other key must decode
        // as the updater decodes it, or every update would fail its signature check.
        let config: Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let key = config["plugins"]["updater"]["pubkey"]
            .as_str()
            .unwrap()
            .trim();
        if key.is_empty() {
            return;
        }
        let text = base64::engine::general_purpose::STANDARD
            .decode(key)
            .expect("plugins.updater.pubkey is the base64 of the .pub file");
        let text = String::from_utf8(text).expect("the .pub file is text");
        minisign_verify::PublicKey::decode(&text)
            .expect("plugins.updater.pubkey is a minisign key");
    }
}
