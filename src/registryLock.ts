import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { defaultRegistryHome as resolveRegistryHome } from './configHome'

export type RegistryLock = {
  pid: number
  port: number
  host: string
  url: string
  token: string
  startedAt: number
  /** Package version that started this process. A mismatch restarts the service. */
  version?: string
}

/** Service data directory. See `configHome.ts` for XDG defaults and legacy migration. */
export function defaultRegistryHome(): string {
  return resolveRegistryHome()
}

export function registryLockPath(home: string): string {
  return join(home, 'registry.json')
}

export function registryDatabasePath(home: string): string {
  return join(home, 'registry.sqlite')
}

/** Copies of plan files, one per run, kept beside the registry database. */
export function registryPlansDir(home: string): string {
  return join(home, 'plans')
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
      version: typeof parsed.version === 'string' ? parsed.version : undefined,
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
