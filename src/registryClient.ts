import { execFile, spawn, type SpawnOptions } from 'node:child_process'
import { promisify } from 'node:util'
import { closeSync, openSync } from 'node:fs'
import { mkdir, open, readFile, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { readGitSnapshot } from './gitStatus'
import { isPidAlive } from './pid'
import type { CompletionState, GitSnapshot, ProcessPulse, ProcessRecord, ProcessRegistration } from './processRecord'
import { chooseBindHost, readLanEnabled } from './lanConfig'
import { formatHttpOrigin } from './localName'
import { DEFAULT_REGISTRY_PORT, HEARTBEAT_MS } from './registryConstants'
import {
  defaultRegistryHome,
  readRegistryLock,
  registryStartingPath,
  type RegistryLock,
} from './registryLock'

export type { RegistryLock } from './registryLock'
export { defaultRegistryHome, readRegistryLock } from './registryLock'

export type PlanLiveState = {
  title?: string
  summary?: string | null
  agent?: string | null
  pendingCount: number
  executionActive: boolean
  executionStep: string | null
  phaseTotal?: number
  phaseDone?: number
  interactionTotal?: number
  interactionDone?: number
  completionRatio?: number
  completionState?: CompletionState
  filesModified?: number
}

const STARTING_STALE_MS = 8_000

function authHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  }
}

/** Address the CLI uses to reach the service. The published URL may still name a legacy `.local` host. */
export function registryBindUrl(lock: Pick<RegistryLock, 'host' | 'port'>): string {
  const normalized = lock.host.trim().toLowerCase()
  const host =
    normalized === '0.0.0.0' || normalized === '::' || normalized === '[::]' || normalized === 'localhost'
      ? '127.0.0.1'
      : lock.host.trim()
  return formatHttpOrigin(host, lock.port)
}

/** Hosts previously published for this service. Resolving them goes through mDNS. */
const LEGACY_MDNS_HOSTS = new Set(['living-plan.local', 'visual-living-plan.local'])

function isLegacyMdnsHost(hostname: string): boolean {
  return LEGACY_MDNS_HOSTS.has(hostname.trim().toLowerCase().replace(/\.$/, ''))
}

/**
 * Dial 127.0.0.1 for a legacy `.local` URL when no service lock is available.
 * Other URLs are left alone.
 */
export function preferLoopbackUrl(publicUrl: string): string {
  let target: URL
  try {
    target = new URL(publicUrl)
  } catch {
    return publicUrl
  }
  if (!isLegacyMdnsHost(target.hostname)) return publicUrl
  target.hostname = '127.0.0.1'
  if (!target.port) target.port = String(DEFAULT_REGISTRY_PORT)
  return target.toString()
}

/**
 * Keep a plan or service URL's path, but dial the bind address.
 * A legacy `.local` host is always rewritten so the CLI does not wait on mDNS.
 * A different origin is left alone.
 */
export function rewriteToBindUrl(lock: RegistryLock, publicUrl: string): string {
  let published: URL
  let target: URL
  try {
    published = new URL(lock.url)
    target = new URL(publicUrl)
  } catch {
    return preferLoopbackUrl(publicUrl)
  }
  if (target.origin !== published.origin && !isLegacyMdnsHost(target.hostname)) return publicUrl
  const bind = new URL(registryBindUrl(lock))
  target.protocol = bind.protocol
  target.hostname = bind.hostname
  target.port = bind.port
  return target.toString()
}

/** Rewrite a published service URL onto the running registry's bind address. */
export async function localServiceUrl(publicUrl: string, home = defaultRegistryHome()): Promise<string> {
  const lock = await readRegistryLock(home)
  if (!lock) return preferLoopbackUrl(publicUrl)
  return rewriteToBindUrl(lock, publicUrl)
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
  // Dial the bind address. A published *.local name is answered by mDNS and can outlast this probe.
  if (!(await registryHealthy(registryBindUrl(lock)))) return null
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

function onBun(): boolean {
  return typeof process.versions.bun === 'string'
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
  if (onBun()) return [entryFile, ...commandArgs]
  const loaders = loaderArgs()
  if (loaders.length > 0) return [...loaders, entryFile, ...commandArgs]
  if (entryFile.endsWith('.ts') || entryFile.endsWith('.tsx') || entryFile.endsWith('.mts')) {
    return ['--experimental-strip-types', entryFile, ...commandArgs]
  }
  return [entryFile, ...commandArgs]
}

const execFileAsync = promisify(execFile)

async function processCommand(pid: number): Promise<string> {
  try {
    return await readFile(`/proc/${pid}/cmdline`, 'utf8')
  } catch {
    // macOS has no /proc. `ps` is the fallback so `lan on` can restart the service there.
  }
  try {
    const { stdout } = await execFileAsync('ps', ['-p', String(pid), '-o', 'command='], { timeout: 1_000 })
    return stdout
  } catch {
    return ''
  }
}

async function looksLikeRegistryProcess(pid: number): Promise<boolean> {
  if (!isPidAlive(pid)) return false
  const command = await processCommand(pid)
  return command.includes('registry')
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

export async function readPackageVersion(entryFile: string): Promise<string> {
  try {
    const raw = await readFile(join(dirname(entryFile), '..', 'package.json'), 'utf8')
    const parsed = JSON.parse(raw) as { version?: string }
    return typeof parsed.version === 'string' && parsed.version ? parsed.version : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

/** Stop a registry this package started. Used when its package version is stale or LAN bind changes. */
export async function stopRegistry(home: string): Promise<void> {
  const lock = await readRegistryLock(home)
  if (!lock) return
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

/** Start the service in its own session, with stdio pointed at the registry log. */
function spawnDetachedRegistry(
  entryFile: string,
  port: number,
  host: string,
  home: string,
  env: NodeJS.ProcessEnv,
) {
  const logPath = join(home, 'registry.log')
  const stdoutFd = openSync(logPath, 'a')
  const stderrFd = openSync(logPath, 'a')
  try {
    const spawnOptions: SpawnOptions = {
      detached: true,
      stdio: ['ignore', stdoutFd, stderrFd],
      env: { ...env, LIVE_PLAN_HOME: home, LIVE_PLAN_DAEMON: '1' },
      windowsHide: true,
    }
    const child = spawn(
      process.execPath,
      childArgs(entryFile, ['registry', '--port', String(port), '--host', host]),
      spawnOptions,
    )
    child.unref()
    return child
  } finally {
    closeSync(stdoutFd)
    closeSync(stderrFd)
  }
}

/**
 * Connect to the shared plan service, starting a detached one when none is running.
 * One service hosts every plan. It keeps running after the spawning CLI and later clients exit.
 */
export async function ensureRegistry(options: {
  entryFile: string
  home?: string
  port?: number
  host?: string
}): Promise<RegistryLock> {
  const home = options.home ?? defaultRegistryHome()
  const host = chooseBindHost(options.host, await readLanEnabled(home))
  const port = options.port ?? DEFAULT_REGISTRY_PORT
  const version = await readPackageVersion(options.entryFile)
  await mkdir(home, { recursive: true, mode: 0o700 })

  const already = await runningRegistry(home)
  if (already?.version === version) return already
  if (already) await stopRegistry(home)

  const age = await startingLockAge(home)
  if (age !== null && age < STARTING_STALE_MS) {
    const waited = await waitForRunning(home, STARTING_STALE_MS)
    if (waited?.version === version) return waited
    if (waited) await stopRegistry(home)
  }

  await rm(registryStartingPath(home), { force: true })
  const stillThere = await runningRegistry(home)
  if (stillThere?.version === version) return stillThere
  if (stillThere) await stopRegistry(home)
  await retireUnhealthyRegistry(home)

  const acquired = await acquireStartingLock(home)
  if (!acquired) {
    const waited = await waitForRunning(home, STARTING_STALE_MS)
    if (waited) return waited
    throw new Error('Timed out waiting for the living-plan registry to start')
  }

  const child = spawnDetachedRegistry(options.entryFile, port, host, home, process.env)

  const waited = await waitForRunning(home, STARTING_STALE_MS)
  await rm(registryStartingPath(home), { force: true })
  if (waited?.version === version) return waited
  if (waited) await stopRegistry(home)

  const late = await runningRegistry(home)
  if (late?.version === version) return late
  if (late) await stopRegistry(home)

  if (child.pid && isPidAlive(child.pid)) {
    try {
      process.kill(child.pid, 'SIGTERM')
    } catch {
      // The child already exited.
    }
  }
  throw new Error(`Timed out starting the living-plan registry. See ${join(home, 'registry.log')}`)
}

export type HostedPlan = {
  id: string
  url: string
  token: string
  planPath: string
  mode: 'watch' | 'comment' | 'review'
}

export async function registerHostedPlan(
  registryUrl: string,
  token: string,
  body: {
    planPath: string
    mode: 'watch' | 'comment' | 'review'
    iteration?: number
    cwd?: string
    configPath?: string
  },
): Promise<HostedPlan> {
  const response = await fetch(new URL('/api/plans', registryUrl), {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5_000),
  })
  if (!response.ok) throw new Error(await response.text())
  const payload = (await response.json()) as { plan: HostedPlan }
  return payload.plan
}

export async function closeHostedPlan(registryUrl: string, token: string, id: string): Promise<void> {
  const response = await fetch(new URL(`/api/plans/${encodeURIComponent(id)}`, registryUrl), {
    method: 'DELETE',
    headers: authHeaders(token),
    signal: AbortSignal.timeout(5_000),
  })
  if (response.status === 404 || response.ok) return
  throw new Error(await response.text())
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

export async function unregisterProcess(
  registryUrl: string,
  token: string,
  id: string,
  outcome?: string | null,
): Promise<void> {
  const response = await fetch(new URL(`/api/processes/${encodeURIComponent(id)}`, registryUrl), {
    method: 'DELETE',
    headers: authHeaders(token),
    body: JSON.stringify({ outcome: outcome ?? null }),
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
      filesModified: nextGit.changedFiles,
      title: live?.title,
      summary: live?.summary,
      agent: live?.agent,
      pendingCount: live?.pendingCount,
      executionActive: live?.executionActive,
      executionStep: live?.executionStep,
      phaseTotal: live?.phaseTotal,
      phaseDone: live?.phaseDone,
      interactionTotal: live?.interactionTotal,
      interactionDone: live?.interactionDone,
      completionRatio: live?.completionRatio,
      completionState: live?.completionState,
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
    async stop(outcome?: string | null) {
      if (stopped) return
      stopped = true
      clearInterval(timer)
      try {
        await unregisterProcess(options.registryUrl, options.token, options.record.id, outcome)
      } catch {
        // Heartbeats stop, and the registry marks the row interrupted once it is stale.
      }
    },
  }
}
