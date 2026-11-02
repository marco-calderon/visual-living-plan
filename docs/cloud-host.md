# Cloud host

This Worker is the opt-in host for `live-plan serve --cloud`. The local machine service is unchanged when that flag is omitted.

You need a Cloudflare account on the Workers Paid plan. Durable Objects are not on the free plan.

## Deploy

From the repository root:

```bash
npm run build:client
npx wrangler login
npx wrangler d1 create living-plan
```

`wrangler.jsonc` already names this deployment's database (`living-plan`, id `cd368c54-8c6c-4144-89c0-cef49f2c7a39`). On another account, copy the printed `database_id` into `database_id` in `wrangler.jsonc`. Then:

```bash
npx wrangler d1 migrations apply living-plan --remote
npx wrangler secret put BETTER_AUTH_SECRET
npx vite build
npx wrangler deploy
```

`vite build` writes the deploy config to `dist/server/wrangler.json`, and `wrangler deploy` picks it up through `.wrangler/deploy/config.json`. Running `wrangler deploy` without the build fails to resolve the TanStack Start entry.

`wrangler.jsonc` lists `BETTER_AUTH_SECRET` under `secrets.required` and has no `vars`, so a deploy never replaces a production secret with a plain value. For local workerd (`npm run host`), copy `.dev.vars.example` to `.dev.vars`. That file is ignored by git.

Migrations are `src/migrations`. `npm run host:migrate` applies them to the local workerd database.

`BETTER_AUTH_SECRET` is a long random string. Wrangler prints the `*.workers.dev` URL. When the host has a custom domain, set `PUBLIC_URL` to that origin with no path. For this deployment that is `https://plan.logspace.qzz.io`:

```bash
npx wrangler secret put PUBLIC_URL
```

Email and password sign-in works without anything else. The sign-in and sign-up pages also offer GitHub and Google. With `PUBLIC_URL` set to `https://plan.logspace.qzz.io`, Better Auth sends GitHub to `https://plan.logspace.qzz.io/api/auth/callback/github` and Google to `https://plan.logspace.qzz.io/api/auth/callback/google`. Then:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
```

Leave Cloudflare Access off this hostname. Access can gate a separate staging hostname for your team. It is not the product login.

A signed-in email account links GitHub or Google from Settings. Each control starts Better Auth's account linking and returns to `/settings`. The provider is attached only when its email matches the signed-in account. A provider that is already linked stays disabled. A loopback plan does not show this section.

Run `npx wrangler d1 migrations apply living-plan --remote` again after you update the Worker. Account settings use the `user_settings` table. Published plan documents use the `plan_versions` table.

## Workers Builds

The Worker deploys from GitHub through Workers Builds (Worker → Settings → Build). Use these settings:

| Setting | Value |
|---|---|
| Production branch | `main` |
| Build command | `npx vite build` |
| Deploy command | `npx wrangler deploy` |
| Non-production branch deploy command | `npx wrangler preview` |

A pull request then gets a Worker Preview and never replaces production. Previews use the `previews` block in `wrangler.jsonc`: the same D1 database, and no `PUBLIC_URL`, so sign-in stays on the preview's own origin. GitHub and Google sign-in only work on the production domain. If a preview reports that `BETTER_AUTH_SECRET` is not set, run `npx wrangler preview secret put BETTER_AUTH_SECRET` with a value different from production's. Workers Builds does not run D1 migrations. Apply them with the command above when a change adds one.

`wrangler.jsonc` pins `account_id`, so the build's Worker lookup always runs in this account. When a build fails with "The name in your wrangler.json file (visual-living-plan) must match the name of your Worker" and the name is correct, the Git connection points at a Worker that no longer exists. Add the build variable `WRANGLER_LOG=debug` to see the expected and actual Worker tags. Disconnect and reconnect the repository under Settings → Build to fix it.

## Signed-in pages

TanStack Start serves `/dashboard`, `/account`, `/settings`, `/login`, `/signup`, `/plans/:id`, and `/plans/:id/history`. `/` and `/review` redirect to `/dashboard`. The Worker does not return those documents. Elysia in `src/host/app.ts` serves the account and plan APIs those pages call, including `GET /api/account`, `GET /api/account/dashboard`, and `PUT /api/account/settings`, plus plan writes, the viewer link, and the Durable Object. A loopback plan keeps writing the theme file beside that plan and does not ask for an account. `/local` stays that sample, with no sign-in.

When an agent publishes a plan (`serve --cloud`, `review --cloud`, or a later file upload), the host stores that markdown in D1. It keeps the latest 10 versions and drops the oldest on the 11th. The dashboard links to the current plan file and the version list. Loopback publish writes the same machine's `registry.sqlite`.

## Use it

```bash
live-plan account login --url https://<host>
live-plan serve path/to/work.plan.md --cloud
```

`account login` opens a browser and stores the session in `~/.config/living-plan/cloud.json`. `serve --cloud` prints the plan URL. The same `events`, `wait`, `watch`, `review`, `mode`, `execution`, `addressing`, `reply`, `address`, and `close` commands take that URL. `dashboard`, `tui`, `logs`, and `lan` stay on this machine.

New accounts are the free tier: 1 open plan, 2 sockets, 1 hour idle. Pro is 10 plans, 4 sockets, 6 hours. Business is 50, 50, and 6 hours. Until billing exists, set the tier in D1:

```bash
npx wrangler d1 execute living-plan --remote --command "UPDATE user SET tier = 'pro' WHERE email = 'you@example.com'"
```
