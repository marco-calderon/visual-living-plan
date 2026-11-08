import { readFile, writeFile } from 'node:fs/promises'
import { planRecordForUrl, readCloudFile, writeCloudFile } from './cloudStore'

/**
 * A person published an edit from a hosted plan page. The hosted copy is newer than the agent's
 * file, so write it into that file and remember its revision. The file watcher then uploads the
 * same text, which the host accepts without a new revision.
 *
 * A local plan's `edit` carries no source: the service already wrote the file.
 * Returns the path written, or null when there was nothing to write.
 */
export async function pullPageEdit(planUrl: string, data: unknown, home?: string): Promise<string | null> {
  if (!data || typeof data !== 'object') return null
  const { source, revision } = data as { source?: unknown; revision?: unknown }
  if (typeof source !== 'string' || !source.trim()) return null
  const file = await readCloudFile(home)
  const record = planRecordForUrl(file, planUrl)
  if (!record) return null
  const current = await readFile(record.planPath, 'utf8').catch(() => null)
  if (current !== source) await writeFile(record.planPath, source)
  if (typeof revision === 'number' && revision > record.revision) {
    file.plans[record.id] = { ...record, revision }
    await writeCloudFile(file, home)
  }
  return current === source ? null : record.planPath
}
