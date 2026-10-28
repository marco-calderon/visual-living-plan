import { randomBytes } from 'node:crypto'
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isLoopbackHost } from './localName'

/** Preference, secret, and the firewall rule this tool added. A fresh home has none of these. */
export function lanPreferencePath(home: string): string {
  return join(home, 'lan.json')
}

export function lanSecretPath(home: string): string {
  return join(home, 'lan-secret')
}

export function lanFirewallPath(home: string): string {
  return join(home, 'lan-firewall.json')
}

export function lanRuntimePath(home: string): string {
  return join(home, 'lan-runtime.json')
}

export type FirewallRule = {
  command: string
  args: string[]
}

export type FirewallRecord = {
  added: boolean
  tool: 'socketfilterfw' | 'ufw' | 'firewalld' | 'netsh' | 'none'
  port: number
  rules: FirewallRule[]
  summary: string
  manual: string | null
}

export type LanRuntime = {
  pid: number
  address: string | null
  port: number
  backend: 'dns-sd' | 'avahi' | 'process' | 'none'
  error?: string
}

async function writePrivate(path: string, body: string): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true, mode: 0o700 })
  await writeFile(path, body, { encoding: 'utf8', mode: 0o600 })
  await chmod(path, 0o600)
}

export async function readLanEnabled(home: string): Promise<boolean> {
  try {
    const parsed = JSON.parse(await readFile(lanPreferencePath(home), 'utf8')) as { enabled?: unknown }
    return parsed.enabled === true
  } catch {
    return false
  }
}

export async function writeLanEnabled(home: string, enabled: boolean): Promise<void> {
  await writePrivate(lanPreferencePath(home), `${JSON.stringify({ enabled }, null, 2)}\n`)
}

export async function readLanSecret(home: string): Promise<string | null> {
  try {
    const value = (await readFile(lanSecretPath(home), 'utf8')).trim()
    return value || null
  } catch {
    return null
  }
}

/** Create the LAN secret once. Later `lan on` keeps it so an existing bookmark still works. */
export async function ensureLanSecret(home: string): Promise<string> {
  const existing = await readLanSecret(home)
  if (existing) return existing
  const secret = randomBytes(32).toString('base64url')
  await writePrivate(lanSecretPath(home), `${secret}\n`)
  return secret
}

export async function readFirewallRecord(home: string): Promise<FirewallRecord | null> {
  try {
    const parsed = JSON.parse(await readFile(lanFirewallPath(home), 'utf8')) as Partial<FirewallRecord>
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.added !== 'boolean' || typeof parsed.port !== 'number') return null
    const tool = parsed.tool
    if (tool !== 'socketfilterfw' && tool !== 'ufw' && tool !== 'firewalld' && tool !== 'netsh' && tool !== 'none') {
      return null
    }
    const rules = Array.isArray(parsed.rules)
      ? parsed.rules.filter(
          (rule): rule is FirewallRule =>
            Boolean(rule) &&
            typeof rule === 'object' &&
            typeof rule.command === 'string' &&
            Array.isArray(rule.args) &&
            rule.args.every((arg) => typeof arg === 'string'),
        )
      : []
    return {
      added: parsed.added,
      tool,
      port: parsed.port,
      rules,
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      manual: typeof parsed.manual === 'string' ? parsed.manual : null,
    }
  } catch {
    return null
  }
}

export async function writeFirewallRecord(home: string, record: FirewallRecord): Promise<void> {
  await writePrivate(lanFirewallPath(home), `${JSON.stringify(record, null, 2)}\n`)
}

export async function readLanRuntime(home: string): Promise<LanRuntime | null> {
  try {
    const parsed = JSON.parse(await readFile(lanRuntimePath(home), 'utf8')) as Partial<LanRuntime>
    if (typeof parsed.pid !== 'number' || typeof parsed.port !== 'number') return null
    const backend = parsed.backend
    if (backend !== 'dns-sd' && backend !== 'avahi' && backend !== 'process' && backend !== 'none') return null
    return {
      pid: parsed.pid,
      address: typeof parsed.address === 'string' ? parsed.address : null,
      port: parsed.port,
      backend,
      error: typeof parsed.error === 'string' ? parsed.error : undefined,
    }
  } catch {
    return null
  }
}

export async function writeLanRuntime(home: string, runtime: LanRuntime): Promise<void> {
  await writePrivate(lanRuntimePath(home), `${JSON.stringify(runtime, null, 2)}\n`)
}

export async function removeLanRuntime(home: string): Promise<void> {
  await rm(lanRuntimePath(home), { force: true })
}

export function isWildcardHost(host: string): boolean {
  const value = host.trim().toLowerCase()
  return value === '0.0.0.0' || value === '::' || value === '[::]'
}

/**
 * LAN mode listens on every interface unless the caller passed a real share address.
 * `0.0.0.0` and `::` keep their current meaning. Loopback does not override LAN mode.
 */
export function chooseBindHost(explicit: string | undefined, lanEnabled: boolean): string {
  const host = explicit?.trim()
  if (host && isWildcardHost(host)) return host === '::' || host === '[::]' ? '::' : '0.0.0.0'
  if (host && !isLoopbackHost(host)) return host
  if (lanEnabled) return '0.0.0.0'
  return host || '127.0.0.1'
}
