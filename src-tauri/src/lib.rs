//! Living Plan as a desktop app: native windows on this machine's plan service and on the hosted
//! app (ADR 0036, ADR 0038).
//!
//! The first window shows the app's own page (`desktop/index.html`). On the first launch that page
//! is the setup screen. After that it calls `connect`, which finds or starts the plan service, or
//! checks the hosted app answers, and returns the page to load: the dashboard, or the plan a
//! `living-plan://` link asked for. Pages on those two hosts stay in app windows; other links open
//! in the default browser.
//!
//! The app keeps no settings logic. Its commands run the CLI it ships (`live-plan desktop ...`,
//! `live-plan skills ...`) and hand the answer to the setup screen.

mod app_link;
mod links;
mod service;

use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::time::Duration;

use app_link::{AppLink, Host, Page};
use links::Destination;
use serde_json::Value;
use tauri::ipc::CapabilityBuilder;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::webview::{DownloadEvent, NewWindowResponse, PageLoadEvent};
use tauri::{
    AppHandle, Manager, Theme, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_deep_link::DeepLinkExt;

const MAIN_WINDOW: &str = "main";
const APP_TITLE: &str = "Living Plan";

/// Runs in every page before its own scripts. See the file for what it does.
const BRIDGE: &str = include_str!("../../desktop/bridge.js");

/// How long cloud mode waits for the hosted app to answer before it offers the local plans.
const CLOUD_TIMEOUT: Duration = Duration::from_secs(4);

/// macOS draws the window buttons over the page, and the page's toolbar is the title bar.
/// Other platforms keep their own title bar.
const OVERLAY_CHROME: bool = cfg!(target_os = "macos");

#[derive(Default)]
struct Shared {
    /// The plan service's origin, once the app found or started it.
    local: RwLock<Option<Url>>,
    /// The hosted app's origin, once setup or `account login` named one.
    cloud: RwLock<Option<Url>>,
    /// The accent and syntax theme chosen in setup. A hosted page saves it to the account once.
    appearance: RwLock<Option<Value>>,
    /// A `living-plan://` page link that arrived before the first `connect`.
    pending: Mutex<Option<(Host, Page)>>,
    /// Whether the first `connect` has finished.
    connected: AtomicBool,
    /// Windows that left the hosted app for a sign-in provider and have not come back.
    signing_in: Mutex<HashSet<String>>,
    /// Origins whose pages may move the window by their toolbar.
    draggable: Mutex<HashSet<String>>,
    /// Numbers the windows opened after the first.
    opened: AtomicUsize,
}

impl Shared {
    fn origin(&self, host: Host) -> Option<Url> {
        let slot = match host {
            Host::Local => &self.local,
            Host::Cloud => &self.cloud,
        };
        slot.read().ok().and_then(|guard| guard.clone())
    }

    fn hosts(&self) -> Vec<Url> {
        [Host::Local, Host::Cloud]
            .into_iter()
            .filter_map(|host| self.origin(host))
            .collect()
    }

    fn destination(&self, url: &Url) -> Destination {
        links::destination(url, &self.hosts())
    }

    fn is_host(&self, url: &Url) -> bool {
        self.hosts()
            .iter()
            .any(|host| host.origin() == url.origin())
    }

    fn next_label(&self) -> String {
        format!("window-{}", self.opened.fetch_add(1, Ordering::Relaxed) + 1)
    }

    fn signing_in(&self, label: &str) -> bool {
        self.signing_in
            .lock()
            .map(|set| set.contains(label))
            .unwrap_or(false)
    }

    fn set_signing_in(&self, label: &str, on: bool) {
        if let Ok(mut set) = self.signing_in.lock() {
            if on {
                set.insert(label.to_string());
            } else {
                set.remove(label);
            }
        }
    }
}

fn shared(app: &AppHandle) -> Arc<Shared> {
    app.state::<Arc<Shared>>().inner().clone()
}

/// Remember a host and let its pages move the window by their toolbar. That one window permission
/// is all a remote page gets. The app's own commands stay closed to it.
fn remember_host(app: &AppHandle, host: Host, origin: Option<Url>) {
    let shared = shared(app);
    let slot = match host {
        Host::Local => &shared.local,
        Host::Cloud => &shared.cloud,
    };
    if let Ok(mut guard) = slot.write() {
        *guard = origin.clone();
    }
    let Some(origin) = origin else {
        return;
    };
    if !OVERLAY_CHROME {
        return;
    }
    let pattern = origin.origin().ascii_serialization();
    let count = {
        let Ok(mut granted) = shared.draggable.lock() else {
            return;
        };
        if !granted.insert(pattern.clone()) {
            return;
        }
        granted.len()
    };
    let capability = CapabilityBuilder::new(format!("toolbar-drag-{count}"))
        .local(false)
        .remote(pattern)
        .window("*")
        .permission("core:window:allow-start-dragging")
        .permission("core:window:allow-internal-toggle-maximize");
    if let Err(error) = app.add_capability(capability) {
        eprintln!("Could not let {origin} move the window: {error}");
    }
}

/// Take in what `desktop state` printed: the hosted app's address, the color mode, and the look.
fn absorb(app: &AppHandle, state: &Value) {
    let cloud = state["cloudUrl"]
        .as_str()
        .and_then(|raw| Url::parse(raw).ok())
        .filter(|url| matches!(url.scheme(), "http" | "https"));
    remember_host(app, Host::Cloud, cloud);
    app.set_theme(match state["config"]["colorMode"].as_str() {
        Some("light") => Some(Theme::Light),
        Some("dark") => Some(Theme::Dark),
        _ => None,
    });
    let appearance = state["config"]["appearance"].clone();
    if let Ok(mut guard) = shared(app).appearance.write() {
        *guard = (!appearance.is_null()).then_some(appearance);
    }
}

/// Run one of the bundled CLI's setup commands off the main thread and read its JSON answer.
async fn cli_json(
    app: AppHandle,
    args: Vec<String>,
    failure: &'static str,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let args: Vec<&str> = args.iter().map(String::as_str).collect();
        service::run_cli(&app, &args, failure).and_then(|stdout| service::last_json_line(&stdout))
    })
    .await
    .map_err(|error| error.to_string())?
}

/// The app's config and what setup can offer: `live-plan desktop state`.
#[tauri::command]
async fn desktop_state(app: AppHandle) -> Result<Value, String> {
    let state = cli_json(
        app.clone(),
        vec!["desktop".into(), "state".into()],
        "Could not read the app's settings",
    )
    .await?;
    absorb(&app, &state);
    Ok(state)
}

/// Change the config: `live-plan desktop configure`. Answers with the new state.
#[tauri::command]
async fn configure(app: AppHandle, patch: Value) -> Result<Value, String> {
    let state = cli_json(
        app.clone(),
        vec![
            "desktop".into(),
            "configure".into(),
            "--json".into(),
            patch.to_string(),
        ],
        "Could not save that",
    )
    .await?;
    absorb(&app, &state);
    Ok(state)
}

/// Put `live-plan` on the PATH, running the CLI in this app: `live-plan desktop install-cli`.
#[tauri::command]
async fn install_cli(app: AppHandle) -> Result<Value, String> {
    cli_json(
        app,
        vec!["desktop".into(), "install-cli".into(), "--json".into()],
        "Could not install the command line tool",
    )
    .await
}

/// Copy the live-plan skill into agent harnesses: `live-plan skills install`.
#[tauri::command]
async fn install_skills(app: AppHandle, harnesses: Vec<String>) -> Result<Value, String> {
    let mut args: Vec<String> = vec!["skills".into(), "install".into(), "--json".into()];
    for harness in harnesses {
        args.push("--harness".into());
        args.push(harness);
    }
    cli_json(app, args, "Could not install the skill").await
}

/// The origin of a host, ready to load. Finds or starts the plan service, or checks that the
/// hosted app answers. Blocks, so call it off the main thread.
fn origin_for(app: &AppHandle, host: Host) -> Result<Url, String> {
    let shared = shared(app);
    match host {
        Host::Local => {
            if let Some(origin) = shared.origin(Host::Local) {
                return Ok(origin);
            }
            let found = service::start(app)?;
            eprintln!(
                "Living Plan: plan service {} at {}",
                found.version, found.origin
            );
            remember_host(app, Host::Local, Some(found.origin.clone()));
            Ok(found.origin)
        }
        Host::Cloud => {
            let origin = shared.origin(Host::Cloud).ok_or_else(|| {
                "No cloud host is set. Open setup and enter its address.".to_string()
            })?;
            if !service::reachable(&origin, CLOUD_TIMEOUT) {
                return Err(format!(
                    "{} did not answer. Check the connection, or open the plans on this computer.",
                    origin.host_str().unwrap_or("The cloud host")
                ));
            }
            Ok(origin)
        }
    }
}

async fn origin_off_thread(app: &AppHandle, host: Host) -> Result<Url, String> {
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || origin_for(&handle, host))
        .await
        .map_err(|error| error.to_string())?
}

/// Return the page for the app's own page to load: the dashboard of `mode` (`local` or `cloud`),
/// or the page a `living-plan://` link asked for before the app was ready.
#[tauri::command]
async fn connect(app: AppHandle, mode: String) -> Result<String, String> {
    let shared = shared(&app);
    let wanted = Host::parse(&mode).ok_or_else(|| format!("Unknown mode {mode}."))?;
    let pending = shared.pending.lock().ok().and_then(|mut link| link.take());
    let (host, page) = pending.unwrap_or((wanted, Page::Dashboard));
    let origin = origin_off_thread(&app, host).await?;
    shared.connected.store(true, Ordering::Relaxed);
    page.url(host, &origin)
        .map(|url| url.to_string())
        .ok_or_else(|| "Could not build that page's address.".to_string())
}

fn open_in_system(url: &Url) {
    if let Err(error) = tauri_plugin_opener::open_url(url.as_str(), None::<&str>) {
        eprintln!("Could not open {url}: {error}");
    }
}

fn focus(window: &WebviewWindow) {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}

/// The app's own page, at a fragment its script reads: `setup`, `setup=skills`, `mode=cloud`.
fn app_page(fragment: &str) -> Url {
    // The webview on Windows serves the app's files over http.
    let base = if cfg!(any(windows, target_os = "android")) {
        "http://tauri.localhost/index.html"
    } else {
        "tauri://localhost/index.html"
    };
    let mut url = Url::parse(base).expect("the app page address is a URL");
    url.set_fragment(Some(fragment));
    url
}

/// Load the app's own page in a window. Runs later, because a window cannot be sent somewhere new
/// from inside the navigation it is deciding on.
fn show_app_page(app: &AppHandle, label: &str, fragment: String) {
    let app = app.clone();
    let label = label.to_string();
    tauri::async_runtime::spawn(async move {
        let window = app
            .get_webview_window(&label)
            .or_else(|| app.get_webview_window(MAIN_WINDOW))
            .or_else(|| app.webview_windows().into_values().next());
        let Some(window) = window else {
            return;
        };
        focus(&window);
        if let Err(error) = window.navigate(app_page(&fragment)) {
            eprintln!("Could not open the app page: {error}");
        }
    });
}

/// Show a page a `living-plan://` link names: the window that already has it, or a new one.
/// Before the first `connect`, the link waits, and `connect` opens it in the first window.
async fn open_page(app: AppHandle, host: Host, page: Page) {
    let shared = shared(&app);
    if !shared.connected.load(Ordering::Relaxed) {
        if let Ok(mut pending) = shared.pending.lock() {
            *pending = Some((host, page));
        }
        return;
    }
    let origin = match origin_off_thread(&app, host).await {
        Ok(origin) => origin,
        Err(error) => {
            eprintln!("Could not open that page: {error}");
            return;
        }
    };
    let shown = app.webview_windows().into_values().find(|window| {
        window
            .url()
            .map(|current| page.is_shown_at(&current, &origin))
            .unwrap_or(false)
    });
    if let Some(window) = shown {
        focus(&window);
        return;
    }
    let Some(url) = page.url(host, &origin) else {
        return;
    };
    match app_window(&app, &shared.next_label(), WebviewUrl::External(url)) {
        Ok(window) => focus(&window),
        Err(error) => eprintln!("Could not open a window: {error}"),
    }
}

/// Links the system hands over, from the CLI or any other program. Only links that open a page
/// count here. A link that changes what the app does must come from a page in an app window.
fn open_links(app: &AppHandle, urls: Vec<Url>) {
    for link in urls.iter().filter_map(AppLink::parse) {
        if let AppLink::Page(host, page) = link {
            // Windows are built off the event thread.
            tauri::async_runtime::spawn(open_page(app.clone(), host, page));
        }
    }
}

/// A `living-plan://` link followed inside an app window: the toolbar's Local and Cloud switch,
/// and the setup buttons in Settings.
fn follow_in_window(app: &AppHandle, label: &str, link: AppLink) {
    match link {
        AppLink::Page(host, page) => {
            tauri::async_runtime::spawn(open_page(app.clone(), host, page));
        }
        AppLink::Switch(host) => show_app_page(app, label, format!("mode={}", host.name())),
        AppLink::Setup(None) => show_app_page(app, label, "setup".into()),
        AppLink::Setup(Some(section)) => show_app_page(app, label, format!("setup={section}")),
    }
}

/// Decide a navigation in the window `label`. True loads it there.
fn navigate(app: &AppHandle, label: &str, url: &Url) -> bool {
    if url.scheme() == app_link::SCHEME {
        if let Some(link) = AppLink::parse(url) {
            follow_in_window(app, label, link);
        }
        return false;
    }
    let shared = shared(app);
    let web = matches!(url.scheme(), "http" | "https");
    match shared.destination(url) {
        Destination::App => {
            if web && shared.is_host(url) {
                shared.set_signing_in(label, false);
            }
            true
        }
        // Signing in with a provider leaves the hosted app and comes back. It has to happen in
        // this window, or the session would land in the browser instead of the app.
        Destination::System if web && shared.signing_in(label) => true,
        Destination::System
            if links::starts_sign_in(url) && shared.origin(Host::Cloud).is_some() =>
        {
            shared.set_signing_in(label, true);
            true
        }
        Destination::System => {
            open_in_system(url);
            false
        }
        Destination::Blocked => false,
    }
}

fn bridge_script() -> String {
    let platform = if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(windows) {
        "windows"
    } else {
        "linux"
    };
    BRIDGE.replace("__PLATFORM__", platform).replace(
        "__CHROME__",
        if OVERLAY_CHROME { "overlay" } else { "native" },
    )
}

/// Tell the page whether the window is full screen, where the window buttons are hidden.
fn mark_fullscreen(window: &WebviewWindow) {
    if !OVERLAY_CHROME {
        return;
    }
    let fullscreen = window.is_fullscreen().unwrap_or(false);
    let _ = window.eval(format!(
        "document.documentElement.dataset.desktopFullscreen = '{fullscreen}'"
    ));
}

/// Hand the look chosen in setup to a hosted page. The page saves a newer one to the account.
fn offer_appearance(app: &AppHandle, window: &WebviewWindow, url: &Url) {
    let shared = shared(app);
    let on_cloud = shared
        .origin(Host::Cloud)
        .is_some_and(|cloud| cloud.origin() == url.origin());
    if !on_cloud {
        return;
    }
    let appearance = shared
        .appearance
        .read()
        .ok()
        .and_then(|guard| guard.clone());
    let Some(appearance) = appearance else {
        return;
    };
    let _ = window.eval(format!(
        "(function(){{var d=window.__LIVING_PLAN_DESKTOP__;if(!d)return;d.appearance={appearance};\
         window.dispatchEvent(new CustomEvent('living-plan-desktop-appearance'))}})()"
    ));
}

/// Put the window buttons level with the middle of the page's toolbar.
fn center_window_buttons(window: &WebviewWindow) {
    #[cfg(target_os = "macos")]
    window_buttons::center(window, None);
    #[cfg(not(target_os = "macos"))]
    let _ = window;
}

/// Name the window. On macOS a new title moves the window buttons, so they are placed again.
fn set_window_title(window: &WebviewWindow, title: &str) {
    #[cfg(target_os = "macos")]
    window_buttons::center(window, Some(title.to_string()));
    #[cfg(not(target_os = "macos"))]
    let _ = window.set_title(title);
}

/// The window buttons of an overlay title bar. AppKit puts them back at the top of the window
/// whenever it lays the title bar out, so the app places them itself after each such change.
#[cfg(target_os = "macos")]
mod window_buttons {
    use objc2_app_kit::{NSView, NSWindow, NSWindowButton, NSWindowStyleMask};
    use objc2_foundation::{NSPoint, NSString};
    use tauri::WebviewWindow;

    /// The height of the page's toolbar, `--titlebar-offset`.
    const TOOLBAR_HEIGHT: f64 = 60.0;
    /// From the window's left edge to the close button.
    const LEFT: f64 = 18.0;

    /// Centers the buttons in the toolbar, after setting `title` when one is given.
    pub fn center(window: &WebviewWindow, title: Option<String>) {
        let target = window.clone();
        let _ = window.run_on_main_thread(move || {
            let Ok(pointer) = target.ns_window() else {
                return;
            };
            // SAFETY: this runs on the main thread, and `target` keeps its NSWindow alive.
            let ns_window: &NSWindow = unsafe { &*pointer.cast() };
            if let Some(title) = title {
                ns_window.setTitle(&NSString::from_str(&title));
            }
            place(ns_window);
        });
    }

    #[allow(unused_unsafe)]
    fn place(window: &NSWindow) {
        // Full screen hides the buttons and keeps them in a window of its own.
        if window.styleMask().contains(NSWindowStyleMask::FullScreen) {
            return;
        }
        let (Some(close), Some(minimize), Some(zoom)) = (
            window.standardWindowButton(NSWindowButton::CloseButton),
            window.standardWindowButton(NSWindowButton::MiniaturizeButton),
            window.standardWindowButton(NSWindowButton::ZoomButton),
        ) else {
            return;
        };
        // SAFETY: main thread, and every view here belongs to the live `window`.
        unsafe {
            let Some(bar) = close.superview() else { return };
            let Some(container) = bar.superview() else {
                return;
            };
            // Finish any pending layout first, so it cannot move the buttons back afterwards.
            window.layoutIfNeeded();

            // Make the title bar as tall as the toolbar, from the top of the window.
            let window_height = window.frame().size.height;
            let mut frame = NSView::frame(&container);
            frame.size.height = TOOLBAR_HEIGHT;
            frame.origin.y = window_height - TOOLBAR_HEIGHT;
            container.setFrame(frame);

            // The toolbar's middle, in the coordinates of the view that holds the buttons.
            let middle = bar.convertPoint_fromView(
                NSPoint::new(0.0, window_height - TOOLBAR_HEIGHT / 2.0),
                None,
            );
            let step = NSView::frame(&minimize).origin.x - NSView::frame(&close).origin.x;
            for (index, button) in [close, minimize, zoom].iter().enumerate() {
                let height = NSView::frame(button).size.height;
                button.setFrameOrigin(NSPoint::new(
                    LEFT + step * index as f64,
                    middle.y - height / 2.0,
                ));
            }
        }
    }
}

fn app_window(app: &AppHandle, label: &str, url: WebviewUrl) -> tauri::Result<WebviewWindow> {
    let on_navigation = (app.clone(), label.to_string());
    let on_new_window = app.clone();
    let on_page_load = app.clone();

    let builder = WebviewWindowBuilder::new(app, label, url)
        .title(APP_TITLE)
        .inner_size(1280.0, 860.0)
        .min_inner_size(640.0, 480.0)
        .center()
        .initialization_script(bridge_script())
        .on_navigation(move |url| navigate(&on_navigation.0, &on_navigation.1, url))
        .on_new_window(move |url, _features| {
            let app = on_new_window.clone();
            let shared = shared(&app);
            if url.scheme() == app_link::SCHEME {
                // The app's own links never open a window of their own.
                return NewWindowResponse::Deny;
            }
            match shared.destination(&url) {
                // A plan opened from the Plans menu gets its own app window.
                Destination::App => {
                    let label = shared.next_label();
                    tauri::async_runtime::spawn(async move {
                        if let Err(error) = app_window(&app, &label, WebviewUrl::External(url)) {
                            eprintln!("Could not open a window: {error}");
                        }
                    });
                }
                Destination::System => open_in_system(&url),
                Destination::Blocked => {}
            }
            NewWindowResponse::Deny
        })
        .on_page_load(move |window, payload| {
            if payload.event() == PageLoadEvent::Finished {
                mark_fullscreen(&window);
                center_window_buttons(&window);
                offer_appearance(&on_page_load, &window, payload.url());
            }
        })
        .on_document_title_changed(|window, title| {
            let title = title.trim();
            set_window_title(&window, if title.is_empty() { APP_TITLE } else { title });
        })
        .on_download(|_webview, event| {
            // The webview picks a free name in Downloads. Show the file once it is there.
            if let DownloadEvent::Finished {
                path: Some(path),
                success: true,
                ..
            } = event
            {
                let _ = tauri_plugin_opener::reveal_item_in_dir(path);
            }
            true
        });

    // The page's toolbar is the title bar: the window buttons sit over its left end. The title
    // still names the window in Mission Control and menus. `center_window_buttons` places the
    // buttons, because AppKit undoes the builder's `traffic_light_position` on its next layout.
    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true);

    let window = builder.build()?;
    center_window_buttons(&window);
    let (events_app, events_label) = (app.clone(), label.to_string());
    window.on_window_event(move |event| {
        let Some(window) = events_app.get_webview_window(&events_label) else {
            return;
        };
        match event {
            WindowEvent::Resized(_) => {
                mark_fullscreen(&window);
                center_window_buttons(&window);
            }
            // AppKit lays the title bar out again on each of these.
            WindowEvent::Focused(_)
            | WindowEvent::ThemeChanged(_)
            | WindowEvent::ScaleFactorChanged { .. } => center_window_buttons(&window),
            _ => {}
        }
    });
    Ok(window)
}

/// The window a menu command acts on: the one in front, else the first.
fn front_window_label(app: &AppHandle) -> String {
    app.webview_windows()
        .into_values()
        .find(|window| window.is_focused().unwrap_or(false))
        .map(|window| window.label().to_string())
        .unwrap_or_else(|| MAIN_WINDOW.to_string())
}

/// Adds a Plans menu to the standard one, so local, cloud, and setup are reachable from any page,
/// including one served by an older plan service that draws no switch in its toolbar.
fn install_menu(app: &AppHandle) -> tauri::Result<()> {
    let menu = Menu::default(app)?;
    let plans = Submenu::with_items(
        app,
        "Plans",
        true,
        &[
            &MenuItem::with_id(
                app,
                "plans-local",
                "Plans on This Computer",
                true,
                None::<&str>,
            )?,
            &MenuItem::with_id(app, "plans-cloud", "Cloud Plans", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "setup", "Setup…", true, None::<&str>)?,
        ],
    )?;
    menu.append(&plans)?;
    app.set_menu(menu)?;
    app.on_menu_event(|app, event| {
        let fragment = match event.id().as_ref() {
            "plans-local" => "mode=local",
            "plans-cloud" => "mode=cloud",
            "setup" => "setup",
            _ => return,
        };
        show_app_page(app, &front_window_label(app), fragment.to_string());
    });
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // First, so a second launch only reaches the app that is open. On Linux and Windows a
        // second launch carries a `living-plan://` link, which the deep-link handler opens.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if args.iter().any(|arg| arg.starts_with("living-plan:")) {
                return;
            }
            let window = app
                .get_webview_window(MAIN_WINDOW)
                .or_else(|| app.webview_windows().into_values().next());
            if let Some(window) = window {
                focus(&window);
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_filter(|label| label == MAIN_WINDOW)
                .build(),
        )
        // Its page script hands `target="_blank"` clicks to the opener over IPC, which service pages
        // do not get. Without it those clicks reach `on_new_window` in `app_window`.
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .manage(Arc::new(Shared::default()))
        .invoke_handler(tauri::generate_handler![
            connect,
            desktop_state,
            configure,
            install_cli,
            install_skills
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            // macOS delivers a link here, at launch and while the app runs.
            app.deep_link()
                .on_open_url(move |event| open_links(&handle, event.urls()));
            // Linux and Windows pass the launch link as an argument, read before that listener.
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                open_links(app.handle(), urls);
            }
            // macOS has an app menu. A menu on the other platforms would add a bar to every window.
            if cfg!(target_os = "macos") {
                install_menu(app.handle())?;
            }
            app_window(
                app.handle(),
                MAIN_WINDOW,
                WebviewUrl::App("index.html".into()),
            )?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Living Plan");
}
