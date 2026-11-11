//! Where a link in a Living Plan window goes.

use tauri::Url;

#[derive(Debug, PartialEq, Eq)]
pub enum Destination {
    /// Load it in an app window: the app's own pages and the plan service's.
    App,
    /// Hand it to the default browser or mail app.
    System,
    /// Drop it. Plan text is written by agents, so other schemes are not handed to the system.
    Blocked,
}

/// `service` is the plan service's origin once the app has connected to it.
pub fn destination(url: &Url, service: Option<&Url>) -> Destination {
    match url.scheme() {
        // The splash page on macOS and Linux, and blank frames.
        "tauri" | "about" => return Destination::App,
        "mailto" => return Destination::System,
        "http" | "https" => {}
        _ => return Destination::Blocked,
    }
    // The splash page on Windows.
    if url.host_str() == Some("tauri.localhost") {
        return Destination::App;
    }
    match service {
        Some(service) if url.origin() == service.origin() => Destination::App,
        _ => Destination::System,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(raw: &str) -> Url {
        Url::parse(raw).unwrap()
    }

    #[test]
    fn plan_service_pages_stay_in_the_app() {
        let service = url("http://127.0.0.1:9477");
        assert_eq!(
            destination(&url("http://127.0.0.1:9477/dashboard"), Some(&service)),
            Destination::App
        );
        assert_eq!(
            destination(
                &url("http://127.0.0.1:9477/plans/abc/#step-2"),
                Some(&service)
            ),
            Destination::App
        );
    }

    #[test]
    fn the_splash_page_stays_in_the_app() {
        assert_eq!(
            destination(&url("tauri://localhost/index.html"), None),
            Destination::App
        );
        assert_eq!(
            destination(&url("http://tauri.localhost/index.html"), None),
            Destination::App
        );
    }

    #[test]
    fn other_sites_and_ports_open_in_the_browser() {
        let service = url("http://127.0.0.1:9477");
        assert_eq!(
            destination(&url("https://github.com/"), Some(&service)),
            Destination::System
        );
        assert_eq!(
            destination(&url("http://127.0.0.1:3000/"), Some(&service)),
            Destination::System
        );
        assert_eq!(
            destination(&url("http://localhost:9477/dashboard"), Some(&service)),
            Destination::System
        );
        assert_eq!(
            destination(&url("http://living-plan.local:9477/"), Some(&service)),
            Destination::System
        );
        assert_eq!(
            destination(&url("mailto:someone@example.com"), Some(&service)),
            Destination::System
        );
    }

    #[test]
    fn the_service_is_not_trusted_before_the_app_connects() {
        assert_eq!(
            destination(&url("http://127.0.0.1:9477/dashboard"), None),
            Destination::System
        );
    }

    #[test]
    fn other_schemes_are_dropped() {
        let service = url("http://127.0.0.1:9477");
        for raw in [
            "file:///etc/passwd",
            "vscode://file/tmp",
            "javascript:alert(1)",
            "data:text/html,hi",
        ] {
            assert_eq!(
                destination(&url(raw), Some(&service)),
                Destination::Blocked,
                "{raw}"
            );
        }
    }
}
