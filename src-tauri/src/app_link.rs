//! `living-plan://` links, which the CLI opens when a plan is ready (ADR 0037).
//!
//!   living-plan://plans/<id>   that plan on the plan service
//!   living-plan://dashboard    the dashboard
//!
//! A link names a page by id only, never by URL, so a link from any website can only open a page
//! on the plan service the app is already connected to.

use tauri::Url;

pub const SCHEME: &str = "living-plan";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AppLink {
    Dashboard,
    Plan(String),
}

impl AppLink {
    pub fn parse(url: &Url) -> Option<AppLink> {
        if url.scheme() != SCHEME {
            return None;
        }
        // `living-plan://plans/<id>` puts "plans" in the host. `living-plan:/plans/<id>` does not.
        let parts: Vec<&str> = url
            .host_str()
            .into_iter()
            .chain(url.path_segments().into_iter().flatten())
            .filter(|part| !part.is_empty())
            .collect();
        match parts.as_slice() {
            ["dashboard"] => Some(AppLink::Dashboard),
            ["plans", id] if valid_plan_id(id) => Some(AppLink::Plan((*id).to_string())),
            _ => None,
        }
    }

    /// The page this link opens on the plan service.
    pub fn page(&self, service: &Url) -> Option<Url> {
        match self {
            AppLink::Dashboard => service.join("/dashboard").ok(),
            AppLink::Plan(id) => service.join(&format!("/plans/{id}/")).ok(),
        }
    }

    /// Whether a window at `current` already shows this link's page.
    pub fn is_shown_at(&self, current: &Url, service: &Url) -> bool {
        if current.origin() != service.origin() {
            return false;
        }
        let path = current.path().trim_end_matches('/');
        match self {
            AppLink::Dashboard => path == "/dashboard",
            AppLink::Plan(id) => path == format!("/plans/{id}"),
        }
    }
}

/// Plan ids are a hash of the plan path: letters, digits, `-`, and `_`.
fn valid_plan_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(raw: &str) -> Url {
        Url::parse(raw).unwrap()
    }

    fn parse(raw: &str) -> Option<AppLink> {
        AppLink::parse(&url(raw))
    }

    #[test]
    fn reads_plan_and_dashboard_links() {
        let plan = Some(AppLink::Plan("b8a6ff1c77eb83c9fda723ce".into()));
        assert_eq!(parse("living-plan://plans/b8a6ff1c77eb83c9fda723ce"), plan);
        assert_eq!(parse("living-plan://plans/b8a6ff1c77eb83c9fda723ce/"), plan);
        assert_eq!(parse("living-plan:/plans/b8a6ff1c77eb83c9fda723ce"), plan);
        assert_eq!(parse("living-plan://dashboard"), Some(AppLink::Dashboard));
        assert_eq!(parse("living-plan://dashboard/"), Some(AppLink::Dashboard));
    }

    #[test]
    fn refuses_anything_else() {
        for raw in [
            "living-plan://plans/",
            "living-plan://plans/a%2Fb",
            "living-plan://plans/abc/versions/2",
            "living-plan://open?url=https://example.com",
            "living-plan://example.com/plans/abc",
            "https://127.0.0.1:9477/plans/abc",
            "other://plans/abc",
        ] {
            assert_eq!(parse(raw), None, "{raw}");
        }
        let long = format!("living-plan://plans/{}", "a".repeat(129));
        assert_eq!(parse(&long), None);
    }

    #[test]
    fn opens_pages_on_the_connected_service() {
        let service = url("http://127.0.0.1:9477/");
        assert_eq!(
            AppLink::Plan("abc".into()).page(&service).unwrap().as_str(),
            "http://127.0.0.1:9477/plans/abc/"
        );
        assert_eq!(
            AppLink::Dashboard.page(&service).unwrap().as_str(),
            "http://127.0.0.1:9477/dashboard"
        );
    }

    #[test]
    fn finds_a_window_that_already_shows_the_page() {
        let service = url("http://127.0.0.1:9477/");
        let plan = AppLink::Plan("abc".into());
        assert!(plan.is_shown_at(&url("http://127.0.0.1:9477/plans/abc/"), &service));
        assert!(plan.is_shown_at(&url("http://127.0.0.1:9477/plans/abc#step-2"), &service));
        assert!(!plan.is_shown_at(&url("http://127.0.0.1:9477/plans/abcd/"), &service));
        assert!(!plan.is_shown_at(&url("http://127.0.0.1:9477/plans/abc/versions/2"), &service));
        assert!(!plan.is_shown_at(&url("http://127.0.0.1:9400/plans/abc/"), &service));
        assert!(!plan.is_shown_at(&url("tauri://localhost/index.html"), &service));
        assert!(AppLink::Dashboard.is_shown_at(&url("http://127.0.0.1:9477/dashboard"), &service));
    }
}
