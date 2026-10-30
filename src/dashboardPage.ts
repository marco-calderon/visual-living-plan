import { clientLogScript } from './clientLog'
import { renderDashboardDocument } from './dashboardDocument'
import { faviconLink } from './favicon'

/** Control dashboard for plans that are running and plans that have finished. */
export function renderDashboardPage(): string {
  return renderDashboardDocument({
    headExtra: faviconLink,
    footScript: `<script>${clientLogScript('/api/logs')}</script>`,
  })
}
