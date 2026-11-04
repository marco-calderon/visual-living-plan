import type { VersionRow } from '../../src/offlineSync.ts'
import { startOfflineEngine } from './engine.ts'

/** Save one opened version, with its source, in the device database. */
export async function rememberPlanVersion(row: Omit<VersionRow, 'id'>): Promise<void> {
  const engine = await startOfflineEngine()
  if (engine?.available) engine.rememberVersion(row)
}

/** Save the host's version list for a plan in the device database. */
export async function rememberPlanVersions(
  planId: string,
  listed: ReadonlyArray<{ seq: number; title?: string; createdAt?: number }>,
): Promise<void> {
  const engine = await startOfflineEngine()
  if (engine?.available) engine.rememberVersions(planId, listed)
}
