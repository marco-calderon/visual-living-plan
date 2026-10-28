import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os'
import { isLoopbackAddress, isLoopbackHost } from './localName'
import { isWildcardHost } from './lanConfig'

export type LanNic = {
  name: string
  address: string
  family: 'ipv4' | 'ipv6'
  internal: boolean
}

export function normalizeIp(address: string): string {
  let value = address.trim().toLowerCase().replace(/^\[|\]$/g, '')
  const zone = value.indexOf('%')
  if (zone !== -1) value = value.slice(0, zone)
  if (value.startsWith('::ffff:')) {
    const mapped = value.slice('::ffff:'.length)
    if (parseIpv4(mapped)) return mapped
  }
  return value
}

function parseIpv4(address: string): number[] | null {
  const parts = address.split('.')
  if (parts.length !== 4) return null
  const numbers = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN))
  if (numbers.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null
  return numbers
}

function firstHextet(address: string): number | null {
  const zone = address.split('%')[0] ?? ''
  if (!zone.includes(':')) return null
  if (zone.startsWith('::')) return 0
  const head = zone.split(':')[0]
  if (!head) return 0
  const value = Number.parseInt(head, 16)
  if (!Number.isFinite(value) || value < 0 || value > 0xffff) return null
  return value
}

export function isLinkLocalAddress(address: string): boolean {
  const value = normalizeIp(address)
  const v4 = parseIpv4(value)
  if (v4) return v4[0] === 169 && v4[1] === 254
  const hextet = firstHextet(value)
  return hextet !== null && hextet >= 0xfe80 && hextet <= 0xfebf
}

/** RFC1918 and IPv6 unique-local. Loopback and link-local are never private LAN addresses. */
export function isPrivateLanAddress(address: string): boolean {
  const value = normalizeIp(address)
  if (!value || isLoopbackAddress(value) || isLinkLocalAddress(value)) return false
  const v4 = parseIpv4(value)
  if (v4) {
    if (v4[0] === 10) return true
    if (v4[0] === 192 && v4[1] === 168) return true
    if (v4[0] === 172 && v4[1] >= 16 && v4[1] <= 31) return true
    return false
  }
  const hextet = firstHextet(value)
  return hextet !== null && hextet >= 0xfc00 && hextet <= 0xfdff
}

export function nicsFromNetworkInterfaces(interfaces: NodeJS.Dict<NetworkInterfaceInfo[] | undefined>): LanNic[] {
  const nics: LanNic[] = []
  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      const family = String(entry.family)
      nics.push({
        name,
        address: entry.address,
        family: family === 'IPv6' || family === '6' ? 'ipv6' : 'ipv4',
        internal: entry.internal,
      })
    }
  }
  return nics
}

function usable(nics: readonly LanNic[]): LanNic[] {
  return nics.filter((nic) => {
    if (nic.internal) return false
    return isPrivateLanAddress(nic.address)
  })
}

/**
 * Pick the address to publish. An explicit local private address wins.
 * Otherwise use a private address on the default-route interface, then any other private address.
 */
export function selectLanAddress(
  nics: readonly LanNic[],
  defaultInterface: string | null,
  explicitHost?: string | null,
): string | null {
  const candidates = usable(nics)
  if (explicitHost && !isWildcardHost(explicitHost) && !isLoopbackHost(explicitHost)) {
    const wanted = normalizeIp(explicitHost)
    const local = candidates.find((nic) => normalizeIp(nic.address) === wanted)
    return local ? normalizeIp(local.address) : null
  }
  const onDefault = defaultInterface ? candidates.filter((nic) => nic.name === defaultInterface) : []
  const pool = onDefault.length > 0 ? onDefault : candidates
  const chosen = pool.find((nic) => nic.family === 'ipv4') ?? pool[0]
  return chosen ? normalizeIp(chosen.address) : null
}

/** First default route in `/proc/net/route`, preferring the lowest metric. */
export function defaultInterfaceFromProcRoute(text: string): string | null {
  let best: { name: string; metric: number } | null = null
  for (const line of text.split('\n').slice(1)) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 7 || parts[1] !== '00000000') continue
    const name = parts[0] ?? ''
    if (!name) continue
    const metric = Number.parseInt(parts[6] ?? '', 10)
    const score = Number.isFinite(metric) ? metric : Number.MAX_SAFE_INTEGER
    if (!best || score < best.metric) best = { name, metric: score }
  }
  return best?.name ?? null
}

/** `route -n get default` on macOS and BSD. */
export function defaultInterfaceFromRouteGet(text: string): string | null {
  for (const line of text.split('\n')) {
    const match = line.match(/^\s*interface:\s+(\S+)/i)
    if (match?.[1]) return match[1]
  }
  return null
}

/** Windows `route print -4`: map the default route's interface address back to a NIC name. */
export function defaultInterfaceFromWindowsRoute(text: string, nics: readonly LanNic[]): string | null {
  for (const line of text.split('\n')) {
    const parts = line.trim().split(/\s+/)
    if (parts[0] !== '0.0.0.0' || parts[1] !== '0.0.0.0') continue
    const iface = parts[3]
    if (!iface) continue
    const nic = nics.find((item) => normalizeIp(item.address) === normalizeIp(iface))
    if (nic) return nic.name
  }
  return null
}

function execText(command: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 2_000 }, (error, stdout) => {
      if (error) resolve(null)
      else resolve(String(stdout ?? ''))
    })
  })
}

export async function detectDefaultInterface(nics: readonly LanNic[] = nicsFromNetworkInterfaces(networkInterfaces())): Promise<string | null> {
  if (process.platform === 'linux') {
    try {
      return defaultInterfaceFromProcRoute(await readFile('/proc/net/route', 'utf8'))
    } catch {
      return null
    }
  }
  if (process.platform === 'darwin') {
    const text = await execText('route', ['-n', 'get', 'default'])
    return text ? defaultInterfaceFromRouteGet(text) : null
  }
  if (process.platform === 'win32') {
    const text = await execText('route', ['print', '-4'])
    return text ? defaultInterfaceFromWindowsRoute(text, nics) : null
  }
  return null
}
