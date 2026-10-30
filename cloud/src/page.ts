import { cloudHostPanel, accountSettingsScript } from './dashboardPage'
import type { AccountSettings } from './accountSettings'

export type CloudPageAssets = {
  planMdxHref: string | null
  planMdxCss: string[]
  selectorHref: string | null
  selectorCss: string[]
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function jsonScript(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c')
}

/** The hosted plan page. The MDX client and the comment layer are the same bundles as the local page. */
export function renderCloudPage(input: {
  basePath: string
  title: string
  source: string
  mode: string
  responses: unknown
  comments: unknown
  review: unknown
  accent: string
  pageWidth: 'default' | 'wide' | 'full'
  diffsTheme: string
  wrapCode: boolean
  owner: boolean
  email: string
  settings: AccountSettings
  assets: CloudPageAssets
}): string {
  const boot = jsonScript({
    source: input.source,
    title: input.title,
    responses: input.responses ?? {},
    locked: false,
    snapshots: [],
    headSnapshotId: null,
  })
  const css = [...input.assets.planMdxCss, ...input.assets.selectorCss]
    .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}" />`)
    .join('\n')
  const planMdx = input.assets.planMdxHref
    ? `<script type="module" src="${escapeHtml(input.assets.planMdxHref)}"></script>`
    : ''
  const selector = input.assets.selectorHref
    ? `<script type="module" src="${escapeHtml(input.assets.selectorHref)}"></script>`
    : ''
  return `<!doctype html>
<html lang="en" data-plan-host="cloud" data-layout="${escapeHtml(input.pageWidth)}" data-diffs-theme="${escapeHtml(input.diffsTheme)}" data-wrap-code="${input.wrapCode ? 'true' : 'false'}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.title)} · Living Plan</title>
  <link rel="icon" type="image/png" href="/favicon.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  ${css}
  <style>
    :root { color-scheme: light; --canvas: #ffffff; --ink: #18181b; }
    @media (prefers-color-scheme: dark) {
      :root { color-scheme: dark; --canvas: #0c0c0e; --ink: #fafafa; }
    }
    body {
      margin: 0;
      background: var(--canvas);
      color: var(--ink);
      font-family: "DM Sans", Inter, "Helvetica Neue", Helvetica, Arial, sans-serif;
    }
    main { max-width: 720px; margin: 0 auto; padding: 40px 20px 96px; }
    html[data-layout="wide"] main { max-width: 1120px; }
    html[data-layout="full"] main { max-width: none; }
    .plan-mdx-pending { display: none; }
    .host-panel { margin: 0 0 24px; padding: 16px; border: 1px solid #e4e4e7; border-radius: 16px; background: #f4f4f5; }
    .host-panel .kicker { margin: 0 0 8px; letter-spacing: 0.08em; text-transform: uppercase; font-size: 12px; font-weight: 600; color: #1d4ed8; }
    .host-panel h2 { margin: 0 0 8px; font-size: 20px; }
    .host-panel p, .host-panel label { font-size: 14px; }
    .host-panel form { display: grid; gap: 12px; margin: 12px 0; }
    .host-panel select, .host-panel input[type="color"] { height: 40px; }
    .host-panel button { height: 40px; border: 0; border-radius: 9999px; padding: 0 24px; background: #09090b; color: #fff; font-weight: 600; }
    .host-panel a { color: #1d4ed8; font-weight: 600; }
    @media (prefers-color-scheme: dark) {
      .host-panel { background: #18181b; border-color: #27272a; }
      .host-panel button { background: #fafafa; color: #0c0c0e; }
    }
  </style>
</head>
<body data-plan-mode="${escapeHtml(input.mode)}" data-plan-host="cloud" data-accent="${escapeHtml(input.accent)}">
  <main>
    ${cloudHostPanel({ owner: input.owner, email: input.email, settings: input.settings })}
    <section data-tab-panel="plan">
      <div id="plan-mdx-root" class="plan-mdx-pending"></div>
    </section>
  </main>
  <script type="application/json" id="living-plan-mdx">${boot}</script>
  <script type="application/json" id="living-plan-comments">${jsonScript(input.comments ?? [])}</script>
  <script type="application/json" id="living-plan-review">${jsonScript(input.review ?? null)}</script>
  <script>window.__LIVE_PLAN_BASE__ = ${JSON.stringify(input.basePath)}; window.__LIVE_PLAN_TRANSPORT__ = "websocket"; window.__LIVE_PLAN_HOST__ = "cloud";</script>
  ${input.owner ? accountSettingsScript() : ''}
  ${planMdx}
  ${selector}
</body>
</html>`
}
