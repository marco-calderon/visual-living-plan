import { spawn, type SpawnOptions } from 'node:child_process'
import { closeSync, openSync } from 'node:fs'
import { mkdir, open, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { readGitSnapshot } from './gitStatus.js'
import { isPidAlive } from './pid.js'
import type { GitSnapshot, ProcessPulse, ProcessRecord, ProcessRegistration } from './processRecord.js'
import { DEFAULT_REGISTRY_HOST, DEFAULT_REGISTRY_PORT, HEARTBEAT_MS } from './registryConstants.js'
import {
  defaultRegistryHome,
  readRegistryLock,
  registryStartingPath,
  type RegistryLock,
} from './registryLock.js'

export type { RegistryLock } from './registryLock.js'
export { defaultRegistryHome, readRegistryLock } from './registryLock.js'

export type PlanLiveState = {
  title?: string
  summary?: string | null
  agent?: string | null
  pendingCount: number
  executionActive: boolean
  executionStep: string | null
}

const STARTING_STALE_MS = 8_000

function authHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  }
}

export async function registryHealthy(url: string): Promise<boolean> {
  try {
    const response = await fetch(new URL('/api/health', url), {
      signal: AbortSignal.timeout(800),
    })
    if (!response.ok) return false
    const body = (await response.json()) as { ok?: boolean }
    return body.ok === true
  } catch {
    return false
  }
}

async function runningRegistry(home: string): Promise<RegistryLock | null> {
  const lock = await readRegistryLock(home)
  if (!lock || !isPidAlive(lock.pid)) return null
  if (!(await registryHealthy(lock.url))) return null
  return lock
}

async function waitForRunning(home: string, timeoutMs: number): Promise<RegistryLock | null> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const lock = await runningRegistry(home)
    if (lock) return lock
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100))
  }
  return null
}

async function startingLockAge(home: string): Promise<number | null> {
  try {
    const info = await stat(registryStartingPath(home))
    return Date.now() - info.mtimeMs
  } catch {
    return null
  }
}

async function acquireStartingLock(home: string): Promise<boolean> {
  try {
    const handle = await open(registryStartingPath(home), 'wx')
    await handle.writeFile(String(process.pid))
    await handle.close()
    return true
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : ''
    if (code === 'EEXIST') return false
    throw error
  }
}

function loaderArgs(): string[] {
  const args = process.execArgv
  const kept: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? ''
    if (arg === '--test' || arg.startsWith('--test-')) continue
    if (arg === '--experimental-strip-types' || arg === '--experimental-sqlite') {
      kept.push(arg)
      continue
    }
    if (arg === '--require' || arg === '-r' || arg === '--import' || arg === '--loader') {
      const next = args[index + 1]
      if (next && !next.startsWith('-')) {
        kept.push(arg, next)
        index += 1
      }
      continue
    }
    if (arg.startsWith('--require=') || arg.startsWith('--import=') || arg.startsWith('--loader=')) {
      kept.push(arg)
    }
  }
  return kept
}

function childArgs(entryFile: string, commandArgs: string[]): string[] {
  const loaders = loaderArgs()
  if (loaders.length > 0) return [...loaders, entryFile, ...commandArgs]
  if (entryFile.endsWith('.ts') || entryFile.endsWith('.tsx') || entryFile.endsWith('.mts')) {
    return ['--experimental-strip-types', entryFile, ...commandArgs]
  }
  return [entryFile, ...commandArgs]
}

async function looksLikeRegistryProcess(pid: number): Promise<boolean> {
  if (!isPidAlive(pid)) return false
  try {
    const cmdline = await readFile(`/proc/${pid}/cmdline`, 'utf8')
    return cmdline.includes('registry')
  } catch {
    return false
  }
}

/** Drop a lock whose process is gone. Stop a wedged registry only when its command line is ours. */
async function retireUnhealthyRegistry(home: string): Promise<void> {
  const lock = await readRegistryLock(home)
  if (!lock) return
  if (await runningRegistry(home)) return
  if (isPidAlive(lock.pid) && (await looksLikeRegistryProcess(lock.pid))) {
    try {
      process.kill(lock.pid, 'SIGTERM')
    } catch {
      // The process already exited.
    }
    const started = Date.now()
    while (isPidAlive(lock.pid) && Date.now() - started < 1_500) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 50))
    }
  }
  if (!isPidAlive(lock.pid)) {
    await rm(join(home, 'registry.json'), { force: true })
  }
}

/**
 * Connect to the shared registry, starting a detached one when none is running.
 * The registry survives individual plan processes so every planner page can list them.
 */
export async function ensureRegistry(options: {
  entryFile: string
  home?: string
  port?: number
  host?: string
}): Promise<RegistryLock> {
  const home = options.home ?? defaultRegistryHome()
  const host = options.host ?? DEFAULT_REGISTRY_HOST
  const port = options.port ?? DEFAULT_REGISTRY_PORT
  await mkdir(home, { recursive: true, mode: 0o700 })

  const already = await runningRegistry(home)
  if (already) return already

  const age = await startingLockAge(home)
  if (age !== null && age < STARTING_STALE_MS) {
    const waited = await waitForRunning(home, STARTING_STALE_MS)
    if (waited) return waited
  }

  await rm(registryStartingPath(home), { force: true })
  const stillThere = await runningRegistry(home)
  if (stillThere) return stillThere
  await retireUnhealthyRegistry(home)

  const acquired = await acquireStartingLock(home)
  if (!acquired) {
    const waited = await waitForRunning(home, STARTING_STALE_MS)
    if (waited) return waited
    throw new Error('Timed out waiting for the living-plan registry to start')
  }

  const logFd = openSync(join(home, 'registry.log'), 'a')
  const spawnOptions: SpawnOptions = {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: { ...process.env, LIVE_PLAN_HOME: home },
    windowsHide: true,
  }
  const child = spawn(
    process.execPath,
    childArgs(options.entryFile, ['registry', '--port', String(port), '--host', host]),
    spawnOptions,
  )
  child.unref()
  closeSync(logFd)

  const waited = await waitForRunning(home, STARTING_STALE_MS)
  await rm(registryStartingPath(home), { force: true })
  if (waited) return waited

  if (child.pid && isPidAlive(child.pid)) {
    try {
      process.kill(child.pid, 'SIGTERM')
    } catch {
      // The child already exited.
    }
  }
  throw new Error(`Timed out starting the living-plan registry. See ${join(home, 'registry.log')}`)
}

export async function listProcesses(registryUrl: string): Promise<ProcessRecord[]> {
  const response = await fetch(new URL('/api/processes', registryUrl), {
    signal: AbortSignal.timeout(1_500),
  })
  if (!response.ok) throw new Error(await response.text())
  const payload = (await response.json()) as { processes?: ProcessRecord[] }
  return payload.processes ?? []
}

export async function registerProcess(
  registryUrl: string,
  token: string,
  record: ProcessRegistration,
): Promise<ProcessRecord> {
  const response = await fetch(new URL('/api/processes', registryUrl), {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(record),
    signal: AbortSignal.timeout(2_000),
  })
  if (!response.ok) throw new Error(await response.text())
  const payload = (await response.json()) as { process: ProcessRecord }
  return payload.process
}

export async function heartbeatProcess(
  registryUrl: string,
  token: string,
  id: string,
  pulse: ProcessPulse,
): Promise<boolean> {
  const response = await fetch(new URL(`/api/processes/${encodeURIComponent(id)}/heartbeat`, registryUrl), {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(pulse),
    signal: AbortSignal.timeout(2_000),
  })
  if (response.status === 404) return false
  if (!response.ok) throw new Error(await response.text())
  return true
}

export async function unregisterProcess(registryUrl: string, token: string, id: string): Promise<void> {
  const response = await fetch(new URL(`/api/processes/${encodeURIComponent(id)}`, registryUrl), {
    method: 'DELETE',
    headers: authHeaders(token),
    signal: AbortSignal.timeout(2_000),
  })
  if (response.status === 404 || response.ok) return
  throw new Error(await response.text())
}

export async function watchRegisteredPlan(options: {
  registryUrl: string
  token: string
  record: ProcessRegistration
  describe?: () => PlanLiveState
}): Promise<{ stop: () => Promise<void> }> {
  const git = options.record.git ?? readGitSnapshot(options.record.directory)
  await registerProcess(options.registryUrl, options.token, { ...options.record, git })

  let stopped = false
  const timer = setInterval(() => {
    void pulse()
  }, HEARTBEAT_MS)
  timer.unref()

  async function pulse(): Promise<void> {
    if (stopped) return
    const live = options.describe?.()
    const nextGit: GitSnapshot = readGitSnapshot(options.record.directory)
    const beat: ProcessPulse = {
      git: nextGit,
      title: live?.title,
      summary: live?.summary,
      agent: live?.agent,
      pendingCount: live?.pendingCount,
      executionActive: live?.executionActive,
      executionStep: live?.executionStep,
    }
    try {
      const ok = await heartbeatProcess(options.registryUrl, options.token, options.record.id, beat)
      if (!ok) {
        await registerProcess(options.registryUrl, options.token, {
          ...options.record,
          ...live,
          git: nextGit,
        })
      }
    } catch {
      // The next interval tries again. Stale rows are pruned by the registry.
    }
  }

  return {
    async stop() {
      if (stopped) return
      stopped = true
      clearInterval(timer)
      try {
        await unregisterProcess(options.registryUrl, options.token, options.record.id)
      } catch {
        // Heartbeats stop, and the registry drops the row once it is stale.
      }
    },
  }
}
