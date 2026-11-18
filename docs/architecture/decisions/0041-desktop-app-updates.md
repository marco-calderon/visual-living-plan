# ADR 0041: The desktop app updates itself from GitHub releases

- Status: Accepted; how the app shows an update amended by [ADR 0042](0042-update-notices-and-whats-new.md)
- Date: 2026-11-18

## Context

The desktop app ([ADR 0036](0036-desktop-app.md)) ships as a `.dmg` on each GitHub release. A person who wants a newer app downloads the next `.dmg` and copies the app over the old one. Most of what changes between releases is the bundled service (`service/dist/cli.js` and the pages it renders), but the app shell, its own page, and the Bun runtime are inside the signed `.app` too. Replacing a few files inside the bundle would break its signature.

The app is signed ad hoc, not notarized. macOS asks a person to allow it once, the first time it opens after a browser download, because the browser marks the download as quarantined. A file the app downloads itself carries no quarantine mark, so macOS does not ask again.

Tauri's updater plugin downloads a whole `.app.tar.gz`, checks it against a public key, and swaps it in for the installed app. It reads a static `latest.json`. GitHub serves the newest release's assets at one fixed address, `releases/latest/download/<name>`.

## Decision

- **Whole-app updates through `tauri-plugin-updater`.** No over-the-air copy of the service alone. The updater replaces the `.app`, so the shell, its page, Bun, and the service always come from one build.
- **The manifest is `latest.json` on the newest release.** `plugins.updater.endpoints` is `https://github.com/marco-calderon/visual-living-plan/releases/latest/download/latest.json`. It names one package per Mac architecture (`darwin-aarch64`, `darwin-x86_64`) with its signature and its URL on that release.
- **Packages are signed with the project's updater key.** It is a minisign key, separate from Apple code signing, and needs no Apple account. The public key is `plugins.updater.pubkey` in `tauri.conf.json`. The private key and its password are the `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` repository secrets. `requireSignedVersion` is on, so the signature must carry the version `latest.json` announces, and a changed manifest cannot install an older release. `tauri build` writes that version into the signature.
- **Only a release build makes packages.** The base config leaves `createUpdaterArtifacts` off, so `desktop:build` and `desktop:install` need no key. On a published release, the Desktop workflow passes `--config '{"bundle":{"createUpdaterArtifacts":true}}'` when the secret is set. Pull requests never get the key. A secret without a public key in the config fails the build.
- **Names and the manifest come from `scripts/updater-manifest.ts`.** `package` copies `bundle/macos/Living Plan.app.tar.gz` and its `.sig` to `Living.Plan_<version>_<arch>.app.tar.gz`, so both builds fit on one release. The `update-manifest` job runs after both builds attach their packages, and `manifest` writes `latest.json` with `package.json`'s version, which is the version the app was built with. The release text becomes the notes.
- **When the app checks.** A release build for macOS with a public key checks 30 seconds after launch and every 6 hours after that. It downloads and installs a newer version in the background, then asks to restart: Restart Now relaunches it, and Later leaves the new version for the next launch. It asks once per version. Living Plan > Check for Updates… checks on request and also says when the app is current or why a check failed. A debug build, a build with no public key, and other platforms never check. *Amended by ADR 0042: the app says all of this in a toast in the page, with the download's progress, instead of native dialogs.*
- **Rust only.** The updater ~~and dialog plugins are~~ plugin is used from Rust. No capability grants its commands to a page, so plan pages and hosted pages cannot start an update. This keeps ADR 0038's rule that pages reach the app only through `living-plan://` links. *ADR 0042 drops the dialog plugin; the page's notice answers through `living-plan://update/...` links that the app checks against its own state.*

## Consequences

People install from the `.dmg` once. Later versions arrive in the app, and macOS does not ask to allow them again, because the app's own download is not quarantined.

An ad hoc signature names one exact build. macOS may ask again for permissions it grants to the app, such as access to the Downloads folder, after an update. A Developer ID certificate would fix that and remove the first launch prompt; nothing here depends on one.

The service runs detached and keeps running through the restart. The new app uses a running service of any version, as before, so its pages come from the new service only once that service restarts, as they do today.

Between the restart prompt and the restart, the running shell's bundle on disk is already the new one, so a setup command run in that window runs the new CLI.

The first release with the updater still has to be installed by hand. A release made before the public key is committed, or without the secret, has no `latest.json`. Apps then find no manifest at `releases/latest` until the next signed release, and a check on request says so.

Losing the private key means installed apps can no longer verify updates: a new key needs one more manual install.
