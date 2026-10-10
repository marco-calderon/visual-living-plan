import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type RegistryLock = {
  pid: number
  port: number
  host: string
  url: string
  token: string
  startedAt: number
}

export function defaultRegistryHome(): string {
  return process.env.LIVE_PLAN_HOME ?? join(homedir(), '.visual-living-plan')
}

export function registryLockPath(home: string): string {
  return join(home, 'registry.json')
}

export function registryDatabasePath(home: string): string {
  return join(home, 'registry.sqlite')
}

export function registryStartingPath(home: string): string {
  return join(home, 'registry.starting')
}

export async function readRegistryLock(home: string): Promise<RegistryLock | null> {
  try {
    const raw = await readFile(registryLockPath(home), 'utf8')
    const parsed = JSON.parse(raw) as Partial<RegistryLock>
    if (typeof parsed.url !== 'string' || typeof parsed.token !== 'string') return null
    if (typeof parsed.pid !== 'number' || typeof parsed.port !== 'number') return null
    return {
      pid: parsed.pid,
      port: parsed.port,
      host: typeof parsed.host === 'string' ? parsed.host : '127.0.0.1',
      url: parsed.url,
      token: parsed.token,
      startedAt: typeof parsed.startedAt === 'number' ? parsed.startedAt : 0,
    }
  } catch {
    return null
  }
}

export async function writeRegistryLock(home: string, lock: RegistryLock): Promise<void> {
  await mkdir(home, { recursive: true, mode: 0o700 })
  const path = registryLockPath(home)
  await writeFile(path, `${JSON.stringify(lock, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  await chmod(path, 0o600)
}
