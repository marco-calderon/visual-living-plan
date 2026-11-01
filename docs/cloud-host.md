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

Copy the printed `database_id` into `database_id` in `wrangler.jsonc`. Then:

```bash
npx wrangler d1 migrations apply living-plan --remote
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler deploy
```

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

Run `npx wrangler d1 migrations apply living-plan --remote` again after you update the Worker. Account settings use the `user_settings` table. Published plan documents use the `plan_versions` table.

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
