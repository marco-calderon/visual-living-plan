import { dashboardClientScript } from './dashboardClientScript'
import { dashboardDocumentCss, dashboardMainHtml } from './dashboardParts'
import { renderHostToolbar } from './hostToolbar'

export type DashboardDocumentInput = {
  lede?: string
  /** Extra titlebar controls. The cloud host passes the user menu. Local passes Running plans. */
  toolbarHtml?: string
  /** Logo target. Local opens running plans. The cloud host opens this dashboard. */
  logoHref?: string
  apiPath?: string
  host?: 'local' | 'cloud'
  headExtra: string
  footScript: string
}

const defaultLede = 'Running plans and plans that have already executed. Summaries follow the local day, week, and month. Files modified is the largest git change set seen during the run. Each plan file is kept in the registry\'s plans folder.'
const defaultToolbar = '<a class="titlebar-action" href="/">Running plans</a>'

/** Control dashboard document. Loopback and the cloud host share this layout. */
export function renderDashboardDocument(options: DashboardDocumentInput): string {
  const input = {
    lede: options.lede ?? defaultLede,
    toolbarHtml: options.toolbarHtml ?? defaultToolbar,
    logoHref: options.logoHref ?? '/',
    apiPath: options.apiPath ?? '/api/dashboard',
    headExtra: options.headExtra,
    footScript: options.footScript,
  }
  const hostAttr = options.host === 'cloud' ? ' data-plan-host="cloud"' : ''
  return `<!doctype html>
<html lang="en"${hostAttr}>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${input.headExtra}
  <title>Plan dashboard · Living Plan</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
${dashboardDocumentCss()}
  </style>
</head>
<body>
  ${renderHostToolbar({ title: 'Dashboard', logoHref: input.logoHref, endHtml: input.toolbarHtml })}
${dashboardMainHtml(input.lede)}
  <script>
${dashboardClientScript(input.apiPath)}
  </script>
  ${input.footScript}
</body>
</html>`
}
