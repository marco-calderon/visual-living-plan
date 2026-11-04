# Changelog — 2026-11-04

## 1.15.0

**PR:** #143

**Bump:** minor

### Summary

Pull request previews can sign in with GitHub and Google. The sign-in goes through production, so GitHub and Google only need the production callback URLs.

### New features

- A preview's GitHub or Google sign-in uses Better Auth's OAuth proxy. Production exchanges the code and sends the encrypted profile back. The preview creates the account and session in its own database, and production stores nothing.

### Notes

Set the same `OAUTH_PROXY_SECRET` for production (`npx wrangler secret put OAUTH_PROXY_SECRET`) and for previews (`npx wrangler preview secret put OAUTH_PROXY_SECRET`), then deploy production. Without it the proxy stays off and previews keep email and password sign-in only. The shell cache name is 1.15.0.
