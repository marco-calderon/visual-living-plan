import type { DashboardPayload, DashboardPeriod } from '../dashboard.js'
import { isDashboardPayload } from './dashboardView.js'

/** The dashboard page reads `GET /api/dashboard?period=`. The terminal view uses that same response. */
export async function readDashboard(registryUrl: string, period: DashboardPeriod): Promise<DashboardPayload> {
  const url = new URL('/api/dashboard', registryUrl)
  url.searchParams.set('period', period)
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error('Could not read the dashboard.')
  }
  const payload: unknown = await response.json()
  if (!isDashboardPayload(payload)) {
    throw new Error('Could not read the dashboard.')
  }
  return payload
}
