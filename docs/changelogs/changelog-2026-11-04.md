# Changelog — 2026-11-04

## 1.14.3

**PR:** pending

**Bump:** patch

### Summary

Picking an older version from the versions menu, on the plan page or on the dashboard, opens that version as a rendered plan instead of its raw Markdown.

### Bugs fixed

- `/plans/<id>/versions/<n>` showed the raw `.plan.md` text. It now renders the saved version with the same plan renderer as the live plan. It is read-only: forms are locked, comments are off, and it does not follow the live plan.
- A hosted plan page no longer gets a 500 from `/api/execution`. The hosted plan now answers that read with the run state and the expected workflow, as the local service does, so the Workflow tab is current when the page opens.
- A hosted plan page no longer calls `/api/theme`, which only the local service has. It reads the owner's appearance from the new `GET /api/account/settings` instead.
- A route the hosted plan does not serve returns 404 instead of 500.

### Improvements

- The versions menu names the version you are on (for example "Version 2") and marks it as the current page.
- Saved versions are kept in the browser database (TanStack DB `versions` collection). The menu lists them offline, and a version you opened before can be opened again offline.
- `GET /api/account/settings` returns the account appearance on its own, the same settings the settings page saves. A hosted plan page you own reads it on load, keeps it in the browser database, and applies it, so a page opened from the device cache picks up appearance changes made elsewhere. A plan you only view keeps its own look.
- The raw file of a version is still available at `/plans/<id>/versions/<n>/document`.

### Notes

No registry restart needed beyond the usual version check. The shell cache name is 1.14.3.

## 1.15.0

**PR:** #143

**Bump:** minor

### Summary

Pull request previews can sign in with GitHub and Google. The sign-in goes through production, so GitHub and Google only need the production callback URLs.

### New features

- A preview's GitHub or Google sign-in uses Better Auth's OAuth proxy. Production exchanges the code and sends the encrypted profile back. The preview creates the account and session in its own database, and production stores nothing.

### Notes

Set the same `OAUTH_PROXY_SECRET` for production (`npx wrangler secret put OAUTH_PROXY_SECRET`) and for previews (`npx wrangler preview secret put OAUTH_PROXY_SECRET`), then deploy production. Without it the proxy stays off and previews keep email and password sign-in only. The shell cache name is 1.15.0.

## 1.15.1

**PR:** #141

**Bump:** patch

### Summary

The rendered plan page has space above the plan, under the title bar.

### Bugs fixed

- The plan column started underneath the fixed title bar. It now clears the bar and leaves the same 16px gap the contents list uses.

### Notes

No registry restart needed beyond the usual version check. The shell cache name is 1.15.1.

## 2.0.0

**PR:** #144

**Bump:** major

### Summary

`live-plan` is the only command name besides `visual-living-plan`. The bundled skill now prefers the hosted service and walks a new user through signing up.

### Breaking changes

- The `living-plan` command alias is gone. Use `live-plan`, or `bunx visual-living-plan`.
- The deprecated `living-plan` skill is gone. `npm run skills:install` removes an old copy of it from `~/.agents/skills`.

### Improvements

- `live-plan account login` prints the sign-in link as well as opening it, so a person can open it when no browser launches. The sign-in page links to sign-up.
- The `live-plan` skill prefers `serve --cloud` on `https://plan.logspace.qzz.io`. It explains how to tell whether the user is signed in, the sign-in and sign-up steps, and the free account limits. The local session stays documented for offline use or when the user declines an account.
- CLI messages say "live-plan registry".

### Notes

Scripts that call `living-plan` must switch to `live-plan`. The config folder stays `~/.config/living-plan`. The shell cache name is 2.0.0.

## 2.0.1

**PR:** #145

**Bump:** patch

### Summary

Outline (secondary) buttons use a soft gray border in light and dark mode instead of a black or white ring.

### Improvements

- Outline buttons on the plan page, settings, dashboard, top bar and account menu use the new `hairline-strong` gray border (`#d4d4d8` light, `#4a4a4a` dark), which steps darker on hover. `DESIGN.md` documents the token and the button rule.

### Notes

No registry restart needed.

## 2.0.2

**PR:** pending

**Bump:** patch

### Summary

Blue accent buttons (Approve, Comment when on, Send, and the comment marks) are readable in light and dark mode, at rest, on hover, and when pressed.

### Bugs fixed

- In light mode the blue buttons used white text on bright blue, about 3.2:1 contrast. They now use a dark label, about 4.6:1.
- In dark mode a custom accent was lifted to a light tint but kept a white label, about 1.8:1 contrast. The label is now picked by contrast, so it turns dark on light fills.

### Improvements

- Blue buttons have hover and pressed states. Each state moves the fill away from the label, so text never gets harder to read.
- New theme tokens `--accent-fill`, `--accent-fill-hover`, and `--accent-fill-active` are derived from any accent color and always meet 4.5:1 against `--on-accent`. Text and borders keep using `--accent`.

### Notes

No registry restart needed beyond the usual version check. The shell cache name is 2.0.2.
