//! `living-plan://` links (ADR 0037, ADR 0038).
//!
//! Links that name a page. The CLI opens them when a plan is ready, and any program may:
//!
//!   living-plan://plans/<id>         that plan on this machine's plan service
//!   living-plan://dashboard          its dashboard
//!   living-plan://cloud/plans/<id>   that plan on the hosted app the desktop app is set up with
//!   living-plan://cloud/dashboard    the hosted dashboard
//!
//! Links that ask the app to do something. They work only when a page in an app window follows
//! them, which is how the toolbar and Settings reach the app without any Tauri API:
//!
//!   living-plan://switch/local       open the plans on this machine, and remember that
//!   living-plan://switch/cloud       open the hosted plans, and remember that
//!   living-plan://setup              show the setup screen
//!   living-plan://setup/<section>    show it at one section: mode, look, cli, or skills
//!
//! A link names a page by id only, never by URL, so a link from any website can only open a page
//! on a host the app already knows.

use tauri::Url;

pub const SCHEME: &str = "living-plan";

/// Where a page lives.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Host {
    /// The plan service on this machine.
    Local,
    /// The hosted app.
    Cloud,
}

impl Host {
    pub fn name(self) -> &'static str {
        match self {
            Host::Local => "local",
            Host::Cloud => "cloud",
        }
    }

    pub fn parse(name: &str) -> Option<Host> {
        match name {
            "local" => Some(Host::Local),
            "cloud" => Some(Host::Cloud),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Page {
    Dashboard,
    Plan(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AppLink {
    Page(Host, Page),
    Switch(Host),
    /// The setup screen, at a section when one is named.
    Setup(Option<&'static str>),
}

const SETUP_SECTIONS: [&str; 4] = ["mode", "look", "cli", "skills"];

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
            ["cloud", rest @ ..] => page(rest).map(|page| AppLink::Page(Host::Cloud, page)),
            ["switch", host] => Host::parse(host).map(AppLink::Switch),
            ["setup"] => Some(AppLink::Setup(None)),
            ["setup", section] => SETUP_SECTIONS
                .iter()
                .find(|known| *known == section)
                .map(|known| AppLink::Setup(Some(known))),
            rest => page(rest).map(|page| AppLink::Page(Host::Local, page)),
        }
    }
}

fn page(parts: &[&str]) -> Option<Page> {
    match parts {
        ["dashboard"] => Some(Page::Dashboard),
        ["plans", id] if valid_plan_id(id) => Some(Page::Plan((*id).to_string())),
        _ => None,
    }
}

impl Page {
    /// This page on a host. The plan service ends a plan path with `/`; the hosted app does not.
    pub fn url(&self, host: Host, origin: &Url) -> Option<Url> {
        match (self, host) {
            (Page::Dashboard, _) => origin.join("/dashboard").ok(),
            (Page::Plan(id), Host::Local) => origin.join(&format!("/plans/{id}/")).ok(),
            (Page::Plan(id), Host::Cloud) => origin.join(&format!("/plans/{id}")).ok(),
        }
    }

    /// Whether a window at `current` already shows this page on `origin`.
    pub fn is_shown_at(&self, current: &Url, origin: &Url) -> bool {
        if current.origin() != origin.origin() {
            return false;
        }
        let path = current.path().trim_end_matches('/');
        match self {
            Page::Dashboard => path == "/dashboard",
            Page::Plan(id) => path == format!("/plans/{id}"),
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

    fn local(page: Page) -> Option<AppLink> {
        Some(AppLink::Page(Host::Local, page))
    }

    fn cloud(page: Page) -> Option<AppLink> {
        Some(AppLink::Page(Host::Cloud, page))
    }

    #[test]
    fn reads_plan_and_dashboard_links() {
        let plan = || Page::Plan("b8a6ff1c77eb83c9fda723ce".into());
        assert_eq!(
            parse("living-plan://plans/b8a6ff1c77eb83c9fda723ce"),
            local(plan())
        );
        assert_eq!(
            parse("living-plan://plans/b8a6ff1c77eb83c9fda723ce/"),
            local(plan())
        );
        assert_eq!(
            parse("living-plan:/plans/b8a6ff1c77eb83c9fda723ce"),
            local(plan())
        );
        assert_eq!(parse("living-plan://dashboard"), local(Page::Dashboard));
        assert_eq!(parse("living-plan://dashboard/"), local(Page::Dashboard));
    }

    #[test]
    fn reads_links_to_the_hosted_app() {
        assert_eq!(
            parse("living-plan://cloud/plans/abc"),
            cloud(Page::Plan("abc".into()))
        );
        assert_eq!(
            parse("living-plan://cloud/dashboard"),
            cloud(Page::Dashboard)
        );
        assert_eq!(parse("living-plan://cloud"), None);
        assert_eq!(parse("living-plan://cloud/plans/a%2Fb"), None);
    }

    #[test]
    fn reads_links_that_ask_the_app_to_act() {
        assert_eq!(
            parse("living-plan://switch/cloud"),
            Some(AppLink::Switch(Host::Cloud))
        );
        assert_eq!(
            parse("living-plan://switch/local"),
            Some(AppLink::Switch(Host::Local))
        );
        assert_eq!(parse("living-plan://switch/elsewhere"), None);
        assert_eq!(parse("living-plan://setup"), Some(AppLink::Setup(None)));
        assert_eq!(
            parse("living-plan://setup/skills"),
            Some(AppLink::Setup(Some("skills")))
        );
        assert_eq!(parse("living-plan://setup/%3Cscript%3E"), None);
    }

    #[test]
    fn refuses_anything_else() {
        for raw in [
            "living-plan://plans/",
            "living-plan://plans/a%2Fb",
            "living-plan://plans/abc/versions/2",
            "living-plan://open?url=https://example.com",
            "living-plan://example.com/plans/abc",
            "living-plan://cloud/https://example.com",
            "https://127.0.0.1:9477/plans/abc",
            "other://plans/abc",
        ] {
            assert_eq!(parse(raw), None, "{raw}");
        }
        let long = format!("living-plan://plans/{}", "a".repeat(129));
        assert_eq!(parse(&long), None);
    }

    #[test]
    fn opens_pages_on_the_host_it_names() {
        let service = url("http://127.0.0.1:9477/");
        let hosted = url("https://plans.example.com/");
        let plan = Page::Plan("abc".into());
        assert_eq!(
            plan.url(Host::Local, &service).unwrap().as_str(),
            "http://127.0.0.1:9477/plans/abc/"
        );
        assert_eq!(
            plan.url(Host::Cloud, &hosted).unwrap().as_str(),
            "https://plans.example.com/plans/abc"
        );
        assert_eq!(
            Page::Dashboard.url(Host::Local, &service).unwrap().as_str(),
            "http://127.0.0.1:9477/dashboard"
        );
        assert_eq!(
            Page::Dashboard.url(Host::Cloud, &hosted).unwrap().as_str(),
            "https://plans.example.com/dashboard"
        );
    }

    #[test]
    fn finds_a_window_that_already_shows_the_page() {
        let service = url("http://127.0.0.1:9477/");
        let plan = Page::Plan("abc".into());
        assert!(plan.is_shown_at(&url("http://127.0.0.1:9477/plans/abc/"), &service));
        assert!(plan.is_shown_at(&url("http://127.0.0.1:9477/plans/abc#step-2"), &service));
        assert!(!plan.is_shown_at(&url("http://127.0.0.1:9477/plans/abcd/"), &service));
        assert!(!plan.is_shown_at(&url("http://127.0.0.1:9477/plans/abc/versions/2"), &service));
        assert!(!plan.is_shown_at(&url("http://127.0.0.1:9400/plans/abc/"), &service));
        assert!(!plan.is_shown_at(&url("tauri://localhost/index.html"), &service));
        assert!(Page::Dashboard.is_shown_at(&url("http://127.0.0.1:9477/dashboard"), &service));
    }
}
