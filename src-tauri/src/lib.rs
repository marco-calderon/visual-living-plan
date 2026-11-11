//! Living Plan as a desktop app: native windows on this machine's plan service.
//!
//! The first window shows a splash page (`desktop/index.html`) that calls `connect`. That command
//! finds or starts the plan service and returns the page to load: the dashboard, or the plan a
//! `living-plan://` link asked for. Pages on the service stay in app windows; other links open in
//! the default browser.

mod app_link;
mod links;
mod service;

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, RwLock};

use app_link::AppLink;
use links::Destination;
use tauri::webview::{DownloadEvent, NewWindowResponse};
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_deep_link::DeepLinkExt;

const MAIN_WINDOW: &str = "main";
const APP_TITLE: &str = "Living Plan";

#[derive(Default)]
struct Shared {
    /// The plan service's origin, once `connect` found it.
    service: RwLock<Option<Url>>,
    /// A `living-plan://` link that arrived before the service was found.
    pending: Mutex<Option<AppLink>>,
    /// Numbers the windows opened after the first.
    opened: AtomicUsize,
}

impl Shared {
    fn service(&self) -> Option<Url> {
        self.service.read().ok().and_then(|guard| guard.clone())
    }

    fn destination(&self, url: &Url) -> Destination {
        links::destination(url, self.service().as_ref())
    }

    fn next_label(&self) -> String {
        format!("window-{}", self.opened.fetch_add(1, Ordering::Relaxed) + 1)
    }
}

/// Find or start the plan service and return the page for the splash page to load.
#[tauri::command]
async fn connect(app: AppHandle, shared: tauri::State<'_, Arc<Shared>>) -> Result<String, String> {
    let handle = app.clone();
    let found = tauri::async_runtime::spawn_blocking(move || service::start(&handle))
        .await
        .map_err(|error| error.to_string())??;
    eprintln!(
        "Living Plan: plan service {} at {}",
        found.version, found.origin
    );
    if let Ok(mut service) = shared.service.write() {
        *service = Some(found.origin.clone());
    }
    // A link that launched the app opens in this first window instead of the dashboard.
    let pending = shared.pending.lock().ok().and_then(|mut link| link.take());
    let page = pending
        .and_then(|link| link.page(&found.origin))
        .unwrap_or(found.dashboard);
    Ok(page.to_string())
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

/// Show what a `living-plan://` link asks for: the window that already has that page, or a new one.
/// Before the service is found, the link waits for `connect`, which opens it in the first window.
fn open_link(app: &AppHandle, link: AppLink) {
    let shared = app.state::<Arc<Shared>>().inner().clone();
    let Some(service) = shared.service() else {
        if let Ok(mut pending) = shared.pending.lock() {
            *pending = Some(link);
        }
        return;
    };
    let shown = app.webview_windows().into_values().find(|window| {
        window
            .url()
            .map(|current| link.is_shown_at(&current, &service))
            .unwrap_or(false)
    });
    if let Some(window) = shown {
        focus(&window);
        return;
    }
    let Some(page) = link.page(&service) else {
        return;
    };
    match app_window(app, &shared.next_label(), WebviewUrl::External(page)) {
        Ok(window) => focus(&window),
        Err(error) => eprintln!("Could not open a window: {error}"),
    }
}

fn open_links(app: &AppHandle, urls: Vec<Url>) {
    for link in urls.iter().filter_map(AppLink::parse) {
        let app = app.clone();
        // Windows are built off the event thread.
        tauri::async_runtime::spawn(async move { open_link(&app, link) });
    }
}

fn app_window(app: &AppHandle, label: &str, url: WebviewUrl) -> tauri::Result<WebviewWindow> {
    let shared = app.state::<Arc<Shared>>().inner().clone();
    let on_navigation = shared.clone();
    let on_new_window = app.clone();

    WebviewWindowBuilder::new(app, label, url)
        .title(APP_TITLE)
        .inner_size(1280.0, 860.0)
        .min_inner_size(640.0, 480.0)
        .center()
        .on_navigation(move |url| match on_navigation.destination(url) {
            Destination::App => true,
            Destination::System => {
                open_in_system(url);
                false
            }
            Destination::Blocked => false,
        })
        .on_new_window(move |url, _features| {
            let app = on_new_window.clone();
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
        .on_document_title_changed(|window, title| {
            let title = title.trim();
            let _ = window.set_title(if title.is_empty() { APP_TITLE } else { title });
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
        })
        .build()
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
        .invoke_handler(tauri::generate_handler![connect])
        .setup(|app| {
            let handle = app.handle().clone();
            // macOS delivers a link here, at launch and while the app runs.
            app.deep_link()
                .on_open_url(move |event| open_links(&handle, event.urls()));
            // Linux and Windows pass the launch link as an argument, read before that listener.
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                open_links(app.handle(), urls);
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
