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

/// `hosts` are the origins whose pages the app shows: the plan service once the app has connected
/// to it, and the hosted app once setup or `account login` named one.
pub fn destination(url: &Url, hosts: &[Url]) -> Destination {
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
    if hosts.iter().any(|host| url.origin() == host.origin()) {
        Destination::App
    } else {
        Destination::System
    }
}

/// Whether a link starts a sign-in with a provider the hosted app offers (GitHub, Google). The
/// window that follows it stays in the app until it is back on the hosted app.
pub fn starts_sign_in(url: &Url) -> bool {
    if url.scheme() != "https" {
        return false;
    }
    match url.host_str() {
        Some("github.com") => url.path().starts_with("/login/oauth/"),
        Some("accounts.google.com") => url.path().starts_with("/o/oauth2/"),
        _ => false,
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
            destination(
                &url("http://127.0.0.1:9477/dashboard"),
                std::slice::from_ref(&service)
            ),
            Destination::App
        );
        assert_eq!(
            destination(
                &url("http://127.0.0.1:9477/plans/abc/#step-2"),
                std::slice::from_ref(&service)
            ),
            Destination::App
        );
    }

    #[test]
    fn the_splash_page_stays_in_the_app() {
        assert_eq!(
            destination(&url("tauri://localhost/index.html"), &[]),
            Destination::App
        );
        assert_eq!(
            destination(&url("http://tauri.localhost/index.html"), &[]),
            Destination::App
        );
    }

    #[test]
    fn other_sites_and_ports_open_in_the_browser() {
        let service = url("http://127.0.0.1:9477");
        assert_eq!(
            destination(&url("https://github.com/"), std::slice::from_ref(&service)),
            Destination::System
        );
        assert_eq!(
            destination(
                &url("http://127.0.0.1:3000/"),
                std::slice::from_ref(&service)
            ),
            Destination::System
        );
        assert_eq!(
            destination(
                &url("http://localhost:9477/dashboard"),
                std::slice::from_ref(&service)
            ),
            Destination::System
        );
        assert_eq!(
            destination(
                &url("http://living-plan.local:9477/"),
                std::slice::from_ref(&service)
            ),
            Destination::System
        );
        assert_eq!(
            destination(
                &url("mailto:someone@example.com"),
                std::slice::from_ref(&service)
            ),
            Destination::System
        );
    }

    #[test]
    fn the_service_is_not_trusted_before_the_app_connects() {
        assert_eq!(
            destination(&url("http://127.0.0.1:9477/dashboard"), &[]),
            Destination::System
        );
    }

    #[test]
    fn hosted_pages_stay_in_the_app_once_the_host_is_known() {
        let hosts = [
            url("http://127.0.0.1:9477"),
            url("https://plans.example.com"),
        ];
        assert_eq!(
            destination(&url("https://plans.example.com/plans/abc"), &hosts),
            Destination::App
        );
        assert_eq!(
            destination(&url("http://127.0.0.1:9477/dashboard"), &hosts),
            Destination::App
        );
        // Sign-in with a provider leaves the host and comes back.
        assert_eq!(
            destination(&url("https://github.com/login/oauth/authorize"), &hosts),
            Destination::System
        );
        assert_eq!(
            destination(&url("http://plans.example.com/plans/abc"), &hosts),
            Destination::System
        );
    }

    #[test]
    fn knows_where_a_provider_sign_in_starts() {
        assert!(starts_sign_in(&url(
            "https://github.com/login/oauth/authorize?client_id=abc"
        )));
        assert!(starts_sign_in(&url(
            "https://accounts.google.com/o/oauth2/v2/auth?client_id=abc"
        )));
        assert!(!starts_sign_in(&url("https://github.com/marco-calderon")));
        assert!(!starts_sign_in(&url(
            "http://github.com/login/oauth/authorize"
        )));
        assert!(!starts_sign_in(&url(
            "https://github.com.example.com/login/oauth/authorize"
        )));
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
                destination(&url(raw), std::slice::from_ref(&service)),
                Destination::Blocked,
                "{raw}"
            );
        }
    }
}
