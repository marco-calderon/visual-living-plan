import { networkInterfaces } from 'node:os'
import { detectDefaultInterface, nicsFromNetworkInterfaces, selectLanAddress } from './lanAddress'
import { lanEntryUrl } from './lanAccess'
import {
  chooseBindHost,
  ensureLanSecret,
  isWildcardHost,
  readFirewallRecord,
  readLanEnabled,
  readLanRuntime,
  readLanSecret,
  writeFirewallRecord,
  writeLanEnabled,
  type FirewallRecord,
} from './lanConfig'
import { closeLanFirewall, openLanFirewall, runCommand, type CommandRunner } from './lanFirewall'
import { MDNS_HOST } from './mdnsPacket'
import { isLoopbackHost } from './localName'
import { isPidAlive } from './pid'
import { DEFAULT_REGISTRY_PORT } from './registryConstants'
import { defaultRegistryHome, ensureRegistry, readRegistryLock, stopRegistry } from './registryClient'
import { recordLog } from './serviceLog'

const NO_ADDRESS = 'This machine has no private LAN address to advertise.'

export type LanReport = {
  enabled: boolean
  bind: string
  advertised: string
  lanUrl: string
  firewall: string
  warning: string | null
}

export function formatLanReport(report: LanReport): string {
  const lines = [
    `LAN: ${report.enabled ? 'enabled' : 'disabled'}`,
    `Bind: ${report.bind}`,
    `Advertised: ${report.advertised}`,
    `LAN URL: ${report.lanUrl}`,
    `Firewall: ${report.firewall}`,
  ]
  if (report.warning) lines.push(`Warning: ${report.warning}`)
  return lines.join('\n')
}

async function selectedAddress(bindHost: string | null): Promise<string | null> {
  const nics = nicsFromNetworkInterfaces(networkInterfaces())
  const explicit = bindHost && !isWildcardHost(bindHost) && !isLoopbackHost(bindHost) ? bindHost : null
  return selectLanAddress(nics, await detectDefaultInterface(nics), explicit)
}

export async function describeLan(home = defaultRegistryHome()): Promise<LanReport> {
  const enabled = await readLanEnabled(home)
  const lock = await readRegistryLock(home)
  const live = Boolean(lock && isPidAlive(lock.pid))
  const port = lock && lock.port > 0 ? lock.port : DEFAULT_REGISTRY_PORT
  const bindHost = live && lock ? lock.host : chooseBindHost(undefined, enabled)
  const runtime = live ? await readLanRuntime(home) : null
  const runtimeOk = runtime && lock && runtime.pid === lock.pid ? runtime : null
  const selected = enabled ? await selectedAddress(bindHost) : null
  const address = runtimeOk ? runtimeOk.address : selected
  const secret = enabled && address ? await readLanSecret(home) : null
  const record = await readFirewallRecord(home)
  const addressWarning = enabled && !address ? (runtimeOk?.error ?? NO_ADDRESS) : null
  const firewallWarning = record?.manual ? [record.summary, record.manual].filter(Boolean).join('\n') : null
  const warning = [addressWarning, firewallWarning].filter(Boolean).join('\n') || null
  return {
    enabled,
    bind: live ? `${bindHost}:${port}` : `${bindHost}:${port} (not running)`,
    advertised: address ? `${MDNS_HOST} → ${address}` : 'none',
    lanUrl: secret ? lanEntryUrl(port, secret) : 'none',
    firewall: record?.summary || 'not applied',
    warning,
  }
}

/** Open a firewall rule only when there is a LAN address. A missing address does not run a command. */
export async function applyLanFirewall(options: {
  home: string
  port: number
  address: string | null
  run?: CommandRunner
  platform?: NodeJS.Platform
}): Promise<FirewallRecord> {
  const run = options.run ?? runCommand
  if (!options.address) {
    const existing = await readFirewallRecord(options.home)
    if (existing?.added) return existing
    const record: FirewallRecord = {
      added: false,
      tool: 'none',
      port: options.port,
      rules: [],
      summary: 'skipped',
      manual: null,
    }
    await writeFirewallRecord(options.home, record)
    return record
  }
  const existing = await readFirewallRecord(options.home)
  if (existing?.added && existing.port === options.port) return existing
  if (existing?.added) await closeLanFirewall(existing, run)
  const attempt = await openLanFirewall(options.port, run, options.platform)
  await writeFirewallRecord(options.home, attempt.record)
  return attempt.record
}

async function noteWarning(warning: string | null): Promise<void> {
  if (!warning) return
  const [message, ...rest] = warning.split('\n')
  await recordLog({
    level: 'warn',
    message: message || 'LAN publishing warning',
    detail: rest.join('\n') || undefined,
    source: 'lan',
    echo: false,
  }).catch(() => undefined)
}

export async function lanOn(entryFile: string, home = defaultRegistryHome(), options?: { port?: number }): Promise<number> {
  await writeLanEnabled(home, true)
  await ensureLanSecret(home)
  const existing = await readRegistryLock(home)
  const port = options?.port ?? (existing && existing.port > 0 ? existing.port : DEFAULT_REGISTRY_PORT)
  await stopRegistry(home)
  const preview = await selectedAddress(null)
  const host = preview?.includes(':') ? '::' : chooseBindHost(undefined, true)
  let lock: Awaited<ReturnType<typeof ensureRegistry>>
  try {
    lock = await ensureRegistry({
      entryFile,
      home,
      host,
      port,
    })
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    return 1
  }
  if (!isWildcardHost(lock.host)) {
    console.error(`Plan service is still bound to ${lock.host}.`)
    return 1
  }
  const address = await selectedAddress(lock.host)
  const firewall = await applyLanFirewall({ home, port: lock.port, address })
  if (!address) await noteWarning(NO_ADDRESS)
  if (firewall.manual) await noteWarning([firewall.summary, firewall.manual].filter(Boolean).join('\n'))
  console.log(formatLanReport(await describeLan(home)))
  return 0
}

export async function lanOff(entryFile: string, home = defaultRegistryHome()): Promise<number> {
  await writeLanEnabled(home, false)
  const record = await readFirewallRecord(home)
  if (record?.added) {
    const closed = await closeLanFirewall(record, runCommand)
    await writeFirewallRecord(home, closed.record)
    if (!closed.ok) await noteWarning([closed.record.summary, closed.record.manual].filter(Boolean).join('\n'))
  }
  const existing = await readRegistryLock(home)
  const wasRunning = Boolean(existing && isPidAlive(existing.pid))
  const port = existing && existing.port > 0 ? existing.port : DEFAULT_REGISTRY_PORT
  await stopRegistry(home)
  if (wasRunning) {
    try {
      const lock = await ensureRegistry({ entryFile, home, host: '127.0.0.1', port })
      if (!isLoopbackHost(lock.host) || isWildcardHost(lock.host)) {
        console.error(`Plan service is still bound to ${lock.host}.`)
        return 1
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : error)
      return 1
    }
  }
  console.log(formatLanReport(await describeLan(home)))
  return 0
}

export async function lanStatus(home = defaultRegistryHome()): Promise<number> {
  console.log(formatLanReport(await describeLan(home)))
  return 0
}
