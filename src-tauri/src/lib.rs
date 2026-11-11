//! Living Plan as a desktop app: native windows on this machine's plan service.
//!
//! The first window shows a splash page (`desktop/index.html`) that calls `connect`. That command
//! finds or starts the plan service and returns its dashboard URL, and the splash page loads it.
//! Pages on the service stay in app windows; other links open in the default browser.

mod links;
mod service;

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, RwLock};

use links::Destination;
use tauri::webview::{DownloadEvent, NewWindowResponse};
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

const MAIN_WINDOW: &str = "main";
const APP_TITLE: &str = "Living Plan";

#[derive(Default)]
struct Shared {
    /// The plan service's origin, once `connect` found it.
    service: RwLock<Option<Url>>,
    /// Numbers the windows opened for links with `target="_blank"`.
    opened: AtomicUsize,
}

impl Shared {
    fn destination(&self, url: &Url) -> Destination {
        let service = self
            .service
            .read()
            .map(|guard| guard.clone())
            .unwrap_or_default();
        links::destination(url, service.as_ref())
    }
}

/// Find or start the plan service and return its dashboard URL for the splash page to load.
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
    Ok(found.dashboard.to_string())
}

fn open_in_system(url: &Url) {
    if let Err(error) = tauri_plugin_opener::open_url(url.as_str(), None::<&str>) {
        eprintln!("Could not open {url}: {error}");
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
                    let label =
                        format!("plan-{}", shared.opened.fetch_add(1, Ordering::Relaxed) + 1);
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
        // First, so a second launch only focuses the window that is open.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let window = app
                .get_webview_window(MAIN_WINDOW)
                .or_else(|| app.webview_windows().into_values().next());
            if let Some(window) = window {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
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
