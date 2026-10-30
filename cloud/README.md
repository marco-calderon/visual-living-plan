# Cloud host

This Worker is the opt-in host for `live-plan serve --cloud`. The local machine service is unchanged when that flag is omitted.

You need a Cloudflare account on the Workers Paid plan. Durable Objects are not on the free plan.

## Deploy

From the repository root, build the plan page, then deploy from `cloud/`:

```bash
npm run build:client
cd cloud
npm install
npx wrangler login
npx wrangler d1 create living-plan
```

Copy the printed `database_id` into `database_id` in `cloud/wrangler.jsonc`. Then:

```bash
npx wrangler d1 migrations apply living-plan --remote
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler deploy
```

`BETTER_AUTH_SECRET` is a long random string. Wrangler prints the `*.workers.dev` URL. Use that origin, with no path, as `PUBLIC_URL` when you attach a custom domain:

```bash
npx wrangler secret put PUBLIC_URL
```

Email and password sign-in works without anything else. For Google or GitHub, create an OAuth app whose callback is `https://<host>/api/auth/callback/google` or `https://<host>/api/auth/callback/github`, then:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
```

Leave Cloudflare Access off this hostname. Access can gate a separate staging hostname for your team. It is not the product login.

Run `npx wrangler d1 migrations apply living-plan --remote` again after you update the Worker. Account settings use the `user_settings` table.

## Account dashboard

A signed-in visit to `/dashboard` shows the account, its tier, and appearance settings. `/` and `/review` redirect there. Those settings are stored in D1 for that account. A hosted plan page uses them for the owning account and shows a hosted-plan panel. A loopback plan keeps writing the theme file beside the plan and does not ask for an account.

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
