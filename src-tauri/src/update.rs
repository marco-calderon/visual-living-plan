//! The app updates itself from GitHub releases (ADR 0041).
//!
//! Each release carries one signed `.app.tar.gz` per Mac architecture and a `latest.json` that
//! names them (`scripts/updater-manifest.ts`). The app reads
//! `releases/latest/download/latest.json` a little after launch and every few hours. When that
//! names a newer version, it downloads the package, checks its signature, swaps the `.app` on
//! disk, and asks to restart. Later leaves the new version for the next launch. The plan service
//! runs detached, so a restart does not interrupt agents.
//!
//! Living Plan > Check for Updates… does the same on request and says when the app is current.
//!
//! The package is checked against `plugins.updater.pubkey` in `tauri.conf.json`, and the version
//! its signature carries must be the one `latest.json` announces (`requireSignedVersion`), so a
//! changed manifest cannot install an older release. A build with no public key, and a debug
//! build, never checks.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde_json::Value;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::{Error as UpdaterError, UpdaterExt};

/// The menu item that checks on request.
pub const MENU_ID: &str = "check-for-updates";

/// The first check waits until the window and the plan service have had the launch to themselves.
const FIRST_CHECK_AFTER: Duration = Duration::from_secs(30);

/// The app can stay open for days.
const CHECK_EVERY: Duration = Duration::from_secs(6 * 60 * 60);

const TITLE: &str = "Living Plan";

#[derive(Default)]
pub struct Updates {
    /// A check or download is running.
    busy: AtomicBool,
    /// The version installed on disk, waiting for a restart.
    installed: Mutex<Option<String>>,
}

/// Whether a check was asked for (the menu) or runs on its own (the timer). Only an asked check
/// says that the app is current or that the check failed.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Asked {
    Yes,
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

/// Whether `plugins.updater` carries a public key. Without one there is nothing to check
/// downloads against, so the app does not check at all.
pub fn has_public_key(updater: Option<&Value>) -> bool {
    updater
        .and_then(|config| config.get("pubkey"))
        .and_then(Value::as_str)
        .is_some_and(|key| !key.trim().is_empty())
}

/// Updates run in release builds for macOS that carry the updater's public key. Releases only
/// ship Mac packages, and a debug build is a checkout, not an install.
pub fn enabled(app: &AppHandle) -> bool {
    cfg!(target_os = "macos")
        && !cfg!(debug_assertions)
        && has_public_key(app.config().plugins.0.get("updater"))
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

/// Check now, for Living Plan > Check for Updates….
pub fn check_now(app: &AppHandle) {
    tauri::async_runtime::spawn(run(app.clone(), Asked::Yes));
}

async fn run(app: AppHandle, asked: Asked) {
    let updates = app.state::<Updates>();
    if updates.busy.swap(true, Ordering::SeqCst) {
        if asked == Asked::Yes {
            tell(
                &app,
                "Living Plan is already checking for updates.",
                MessageDialogKind::Info,
            );
        }
        return;
    }
    let outcome = check_and_install(&app, &updates).await;
    updates.busy.store(false, Ordering::SeqCst);

    match outcome {
        Ok(Outcome::Installed { version, fresh }) if fresh || asked == Asked::Yes => {
            offer_restart(&app, &version)
        }
        Ok(Outcome::Installed { .. }) => {}
        Ok(Outcome::Current) => {
            if asked == Asked::Yes {
                let version = app.package_info().version.to_string();
                tell(
                    &app,
                    &format!("Living Plan {version} is the latest version."),
                    MessageDialogKind::Info,
                );
            }
        }
        Err(error) => {
            eprintln!("Living Plan: update check failed: {error}");
            if asked == Asked::Yes {
                tell(&app, &describe(&error), MessageDialogKind::Warning);
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
    let already = updates
        .installed
        .lock()
        .map(|installed| installed.as_deref() == Some(version.as_str()))
        .unwrap_or(false);
    if already {
        return Ok(Outcome::Installed {
            version,
            fresh: false,
        });
    }

    eprintln!(
        "Living Plan: installing {version} over {}",
        update.current_version
    );
    update.download_and_install(|_, _| {}, || {}).await?;
    if let Ok(mut installed) = updates.installed.lock() {
        *installed = Some(version.clone());
    }
    Ok(Outcome::Installed {
        version,
        fresh: true,
    })
}

fn offer_restart(app: &AppHandle, version: &str) {
    let handle = app.clone();
    app.dialog()
        .message(format!(
            "Living Plan {version} is installed. Restart now to use it, or it opens the next time \
             you start Living Plan. The plan service keeps running either way."
        ))
        .title(TITLE)
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Restart Now".into(),
            "Later".into(),
        ))
        .show(move |restart| {
            if restart {
                handle.request_restart();
            }
        });
}

fn tell(app: &AppHandle, message: &str, kind: MessageDialogKind) {
    app.dialog()
        .message(message)
        .title(TITLE)
        .kind(kind)
        .buttons(MessageDialogButtons::Ok)
        .show(|_| {});
}

/// What an asked check shows when it fails.
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

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
    fn the_shipped_config_deserializes_for_the_plugin() {
        // The plugin refuses to start, and with it the app, when `plugins.updater` has no
        // `pubkey` field, even an empty one.
        let config: Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let updater = config["plugins"]["updater"].clone();
        assert!(updater["pubkey"].is_string());
        serde_json::from_value::<tauri_plugin_updater::Config>(updater).unwrap();
    }
}
