import type { ProcessRecord } from '../processRecord'
import { safeHttpUrl } from './dashboardView'

/** Same sentence the registry home page uses for the live plan list. */
export function registryStatusLine(count: number): string {
  if (count === 0) return 'No plans are running.'
  if (count === 1) return '1 plan linked to a directory.'
  return `${count} plans linked to directories.`
}

/** Uptime label from the registry home page. */
export function processUptime(startedAt: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - Number(startedAt)) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

/** Lines under a running-plan title. Order matches the registry home card. */
export function processLines(record: ProcessRecord, now = Date.now()): string[] {
  const lines: string[] = []
  if (record.directory) lines.push(record.directory)
  if (record.planPath) lines.push(record.planPath)
  const git = record.git
  if (git?.summary) lines.push(git.summary)
  if (git?.root && git.root !== record.directory) lines.push(`Repository ${git.root}`)
  const paths = Array.isArray(git?.changedPaths) ? git.changedPaths.slice(0, 4) : []
  if (paths.length > 0) lines.push(paths.join(' · '))
  const bits: string[] = []
  if (record.pid) bits.push(`pid ${record.pid}`)
  if (record.startedAt) bits.push(`up ${processUptime(record.startedAt, now)}`)
  if (typeof record.pendingCount === 'number') bits.push(`${record.pendingCount} pending`)
  if (record.executionActive) {
    bits.push(record.executionStep ? `live · ${record.executionStep}` : 'execution live')
  }
  if (bits.length > 0) lines.push(bits.join(' · '))
  return lines
}

/** Live site link. The registry home only offers Open for an http(s) URL. */
export function processOpenUrl(record: Pick<ProcessRecord, 'url'>): string | null {
  return safeHttpUrl(record.url)
}
