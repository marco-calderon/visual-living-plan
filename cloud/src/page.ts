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
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.title)} · Living Plan</title>
  ${css}
  <style>
    body { margin: 0; font-family: "DM Sans", Inter, sans-serif; background: #f7f6f3; color: #1c1917; }
    main { max-width: 720px; margin: 0 auto; padding: 2.5rem 1.25rem 6rem; }
    .plan-mdx-pending { display: none; }
  </style>
</head>
<body data-plan-mode="${escapeHtml(input.mode)}" data-accent="${escapeHtml(input.accent)}">
  <main>
    <section data-tab-panel="plan">
      <div id="plan-mdx-root" class="plan-mdx-pending"></div>
    </section>
  </main>
  <script type="application/json" id="living-plan-mdx">${boot}</script>
  <script type="application/json" id="living-plan-comments">${jsonScript(input.comments ?? [])}</script>
  <script type="application/json" id="living-plan-review">${jsonScript(input.review ?? null)}</script>
  <script>window.__LIVE_PLAN_BASE__ = ${JSON.stringify(input.basePath)}; window.__LIVE_PLAN_TRANSPORT__ = "websocket";</script>
  ${planMdx}
  ${selector}
</body>
</html>`
}
