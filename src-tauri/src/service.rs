//! Find the plan service on this machine, or start it, with the CLI bundled in the app.
//!
//! The app runs `living-plan-bun service/dist/cli.js dashboard --json --any-version`. That command
//! returns a running service whatever its version, so the app never restarts one that agents
//! started with another CLI version. When none is running it starts this app's copy, detached like
//! any CLI start, so the service outlives the window as it outlives `live-plan dashboard`.

use std::io::Read;
use std::path::PathBuf;
use std::process::{Command, Output, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use serde::Deserialize;
use tauri::{AppHandle, Manager, Url};

/// The Bun runtime shipped beside the app binary (`externalBin` in tauri.conf.json).
const RUNTIME: &str = if cfg!(windows) {
    "living-plan-bun.exe"
} else {
    "living-plan-bun"
};

/// The CLI waits about 15 seconds for a new service. This only stops a wedged process.
const START_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Debug)]
pub struct Service {
    /// The dashboard page the window opens.
    pub dashboard: Url,
    /// The service's origin. Its pages open in the app; other sites open in the browser.
    pub origin: Url,
    /// The version of the service that answered, which may not be this app's.
    pub version: String,
}

#[derive(Deserialize)]
struct DashboardLine {
    url: String,
    service: String,
    version: String,
}

/// Read the JSON line `dashboard --json` prints last.
pub fn parse_dashboard_output(stdout: &str) -> Result<Service, String> {
    let line = stdout
        .lines()
        .rev()
        .map(str::trim)
        .find(|line| line.starts_with('{'))
        .ok_or_else(|| "The plan service did not print its address.".to_string())?;
    let parsed: DashboardLine = serde_json::from_str(line).map_err(|error| {
        format!("The plan service printed an address the app cannot read: {error}")
    })?;
    let dashboard = web_url(&parsed.url)?;
    let origin = web_url(&parsed.service)?;
    Ok(Service {
        dashboard,
        origin,
        version: parsed.version,
    })
}

fn web_url(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw)
        .map_err(|error| format!("The plan service address {raw} is not a URL: {error}"))?;
    match url.scheme() {
        "http" | "https" => Ok(url),
        scheme => Err(format!(
            "The plan service address {raw} uses {scheme}, not http."
        )),
    }
}

pub fn start(app: &AppHandle) -> Result<Service, String> {
    let runtime = runtime_path()?;
    let entry = app
        .path()
        .resource_dir()
        .map_err(|error| format!("Could not find the app's files: {error}"))?
        .join("service")
        .join("dist")
        .join("cli.js");
    if !entry.is_file() {
        return Err(format!(
            "The plan service is missing from this app ({}). Reinstall Living Plan.",
            entry.display()
        ));
    }

    let mut command = Command::new(&runtime);
    command
        .arg(&entry)
        .args(["dashboard", "--json", "--any-version"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    // Apps launched from Finder or a desktop menu start in `/`.
    if let Ok(home) = app.path().home_dir() {
        command.current_dir(home);
    }
    hide_console(&mut command);

    let output = run_with_timeout(command, START_TIMEOUT)?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let detail = last_lines(&stderr, 6);
        return Err(if detail.is_empty() {
            format!("The plan service did not start ({}).", output.status)
        } else {
            format!("The plan service did not start.\n{detail}")
        });
    }
    parse_dashboard_output(&stdout)
}

fn runtime_path() -> Result<PathBuf, String> {
    let exe = std::env::current_exe()
        .map_err(|error| format!("Could not find the app binary: {error}"))?;
    let runtime = exe
        .parent()
        .ok_or_else(|| "Could not find the app's folder.".to_string())?
        .join(RUNTIME);
    if runtime.is_file() {
        Ok(runtime)
    } else {
        Err(format!(
            "The Bun runtime is missing from this app ({}). Reinstall Living Plan.",
            runtime.display()
        ))
    }
}

fn run_with_timeout(mut command: Command, timeout: Duration) -> Result<Output, String> {
    let mut child = command
        .spawn()
        .map_err(|error| format!("Could not run the plan service: {error}"))?;
    let stdout = child.stdout.take().map(drain);
    let stderr = child.stderr.take().map(drain);
    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if started.elapsed() < timeout => thread::sleep(Duration::from_millis(50)),
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!(
                    "The plan service did not answer within {} seconds.",
                    timeout.as_secs()
                ));
            }
            Err(error) => return Err(format!("Lost the plan service process: {error}")),
        }
    };
    let collect = |reader: Option<thread::JoinHandle<Vec<u8>>>| {
        reader.and_then(|r| r.join().ok()).unwrap_or_default()
    };
    Ok(Output {
        status,
        stdout: collect(stdout),
        stderr: collect(stderr),
    })
}

fn drain(mut pipe: impl Read + Send + 'static) -> thread::JoinHandle<Vec<u8>> {
    thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = pipe.read_to_end(&mut bytes);
        bytes
    })
}

fn last_lines(text: &str, count: usize) -> String {
    let lines: Vec<&str> = text
        .lines()
        .map(str::trim_end)
        .filter(|line| !line.is_empty())
        .collect();
    lines[lines.len().saturating_sub(count)..].join("\n")
}

#[cfg(windows)]
fn hide_console(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn hide_console(_command: &mut Command) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_last_json_line() {
        let stdout = "Migrated ~/.living-plan\n{\"url\":\"http://127.0.0.1:9477/dashboard\",\"service\":\"http://127.0.0.1:9477\",\"version\":\"2.22.0\"}\n";
        let service = parse_dashboard_output(stdout).unwrap();
        assert_eq!(
            service.dashboard.as_str(),
            "http://127.0.0.1:9477/dashboard"
        );
        assert_eq!(service.origin.as_str(), "http://127.0.0.1:9477/");
        assert_eq!(service.version, "2.22.0");
    }

    #[test]
    fn refuses_output_without_an_address() {
        assert!(
            parse_dashboard_output("Plan dashboard: http://127.0.0.1:9477/dashboard\n").is_err()
        );
        assert!(parse_dashboard_output("{\"url\":1}").is_err());
    }

    #[test]
    fn refuses_an_address_that_is_not_http() {
        let stdout = "{\"url\":\"file:///etc/passwd\",\"service\":\"http://127.0.0.1:9477\",\"version\":\"2.22.0\"}";
        assert!(parse_dashboard_output(stdout).is_err());
    }

    #[test]
    fn keeps_the_end_of_an_error() {
        assert_eq!(last_lines("a\n\nb\nc\n", 2), "b\nc");
        assert_eq!(last_lines("", 3), "");
    }
}
