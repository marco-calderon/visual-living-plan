import { spawn } from 'node:child_process'
import { lookup } from 'node:dns/promises'
import { connect, createServer, type Socket } from 'node:net'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'

import type { FetchApp } from './httpServer'
import { bindElysiaAt } from './httpServer'

/**
 * Browser name for the loopback plan service.
 * `.local` is the multicast-DNS suffix (RFC 6762). This process pins the name
 * in the hosts file so the CLI and the browser both resolve it to loopback.
 * The socket stays on 127.0.0.1. Port 80, when it can be opened, is only a
 * second front door so the URL can omit the port.
 */
export const LOCAL_PLAN_HOSTNAME = 'living-plan.local'

const HOSTS_MARK = 'visual-living-plan'
const LOOPBACK_HTTP_PORT = 80

export type Elevate = 'never' | 'passwordless' | 'prompt'

export type LocalNameStatus = {
  outcome: 'ready' | 'missing' | 'conflict'
  addresses: string[]
  message: string
}

export type HostsWriteResult = 'added' | 'present' | 'conflict' | 'denied' | 'removed' | 'absent'

type ResolvedName =
  | { kind: 'ready'; addresses: string[] }
  | { kind: 'missing' }
  | { kind: 'conflict'; addresses: string[] }

export function localNameEnabled(): boolean {
  const flag = (process.env.LIVE_PLAN_LOCAL_NAME ?? '').trim().toLowerCase()
  return flag !== '0' && flag !== 'off' && flag !== 'false' && flag !== 'no'
}

/** Publish the local name for a fixed loopback port. Random ports (tests) stay on the IP. */
export function localNameDesired(host: string, port: number): boolean {
  return localNameEnabled() && isLoopbackHost(host) && port > 0
}

export function isLoopbackAddress(address: string): boolean {
  const value = address.trim().toLowerCase()
  if (value === '::1' || value === '0:0:0:0:0:0:0:1') return true
  if (value.startsWith('::ffff:127.')) return true
  const parts = value.split('.')
  if (parts.length !== 4 || parts[0] !== '127') return false
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, '')
  return normalized === 'localhost' || isLoopbackAddress(normalized)
}

/** HTTP origin. Port 80 is omitted so a browser can open the name with no port. */
export function formatHttpOrigin(host: string, port: number): string {
  const bracketed = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
  if (port === LOOPBACK_HTTP_PORT) return `http://${bracketed}`
  return `http://${bracketed}:${port}`
}

export function servicePublicOrigin(input: {
  bindHost: string
  port: number
  nameReady: boolean
  portless: boolean
}): string {
  if (input.nameReady && isLoopbackHost(input.bindHost)) {
    return formatHttpOrigin(LOCAL_PLAN_HOSTNAME, input.portless ? LOOPBACK_HTTP_PORT : input.port)
  }
  return formatHttpOrigin(input.bindHost, input.port)
}

export function hostsFilePath(): string {
  if (process.platform === 'win32') {
    const root = process.env.SystemRoot ?? 'C:\\Windows'
    return `${root}\\System32\\drivers\\etc\\hosts`
  }
  return '/etc/hosts'
}

export function parseHostsLine(line: string): { address: string; names: string[] } | null {
  const comment = line.indexOf('#')
  const body = (comment === -1 ? line : line.slice(0, comment)).trim()
  if (!body) return null
  const parts = body.split(/\s+/)
  const address = parts[0]
  if (!address || parts.length < 2) return null
  return { address, names: parts.slice(1).map((name) => name.toLowerCase()) }
}

export function upsertHostsText(text: string, hostname: string): { text: string; result: 'added' | 'present' | 'conflict' } {
  const name = hostname.toLowerCase()
  const lines = text.split(/\r?\n/)
  let present = false
  for (const line of lines) {
    const parsed = parseHostsLine(line)
    if (!parsed?.names.includes(name)) continue
    if (!isLoopbackAddress(parsed.address)) return { text, result: 'conflict' }
    present = true
  }
  if (present) return { text, result: 'present' }
  const trimmed = text.replace(/\s*$/, '')
  const next = `${trimmed}${trimmed ? '\n' : ''}127.0.0.1\t${hostname}\t# ${HOSTS_MARK}\n`
  return { text: next, result: 'added' }
}

export function removeHostsText(text: string, hostname: string): { text: string; result: 'removed' | 'absent' } {
  const name = hostname.toLowerCase()
  const lines = text.split(/\r?\n/)
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  const kept: string[] = []
  let removed = false
  for (const line of lines) {
    const parsed = parseHostsLine(line)
    const marked = line.includes(HOSTS_MARK)
    if (marked && parsed?.names.includes(name)) {
      removed = true
      continue
    }
    kept.push(line)
  }
  if (!removed) return { text, result: 'absent' }
  const next = kept.length > 0 ? `${kept.join('\n')}\n` : ''
  return { text: next, result: 'removed' }
}

function systemErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') return error.code
  return ''
}

async function readHosts(path: string): Promise<{ text: string } | 'denied' | 'missing'> {
  try {
    return { text: await readFile(path, 'utf8') }
  } catch (error) {
    const code = systemErrorCode(error)
    if (code === 'ENOENT') return 'missing'
    if (code === 'EACCES' || code === 'EPERM') return 'denied'
    throw error
  }
}

async function replaceFile(path: string, text: string): Promise<'ok' | 'denied'> {
  const temp = `${path}.${process.pid}.visual-living-plan.tmp`
  try {
    await writeFile(temp, text, { encoding: 'utf8', mode: 0o644 })
    await rename(temp, path)
    return 'ok'
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined)
    const code = systemErrorCode(error)
    if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') return 'denied'
    throw error
  }
}

export async function installHostsName(hostsPath: string, hostname = LOCAL_PLAN_HOSTNAME): Promise<HostsWriteResult> {
  const read = await readHosts(hostsPath)
  if (read === 'denied') return 'denied'
  const edited = upsertHostsText(read === 'missing' ? '' : read.text, hostname)
  if (edited.result !== 'added') return edited.result
  const wrote = await replaceFile(hostsPath, edited.text)
  return wrote === 'denied' ? 'denied' : 'added'
}

export async function removeHostsName(hostsPath: string, hostname = LOCAL_PLAN_HOSTNAME): Promise<HostsWriteResult> {
  const read = await readHosts(hostsPath)
  if (read === 'denied') return 'denied'
  if (read === 'missing') return 'absent'
  const edited = removeHostsText(read.text, hostname)
  if (edited.result !== 'removed') return 'absent'
  const wrote = await replaceFile(hostsPath, edited.text)
  return wrote === 'denied' ? 'denied' : 'removed'
}

/** `.local` goes through mDNS and can take seconds even when the hosts file already has the name. */
const LOOKUP_TIMEOUT_MS = 400

async function resolutionFromHosts(hostsPath: string, hostname: string): Promise<ResolvedName | null> {
  const read = await readHosts(hostsPath)
  if (read === 'denied' || read === 'missing') return null
  const name = hostname.toLowerCase()
  const addresses: string[] = []
  for (const line of read.text.split(/\r?\n/)) {
    const parsed = parseHostsLine(line)
    if (!parsed?.names.includes(name)) continue
    addresses.push(parsed.address)
  }
  if (addresses.length === 0) return null
  if (addresses.every((address) => isLoopbackAddress(address))) return { kind: 'ready', addresses }
  return { kind: 'conflict', addresses }
}

function resolutionFromLookup(hostname: string, timeoutMs: number): Promise<ResolvedName> {
  return new Promise((resolveLookup, reject) => {
    let settled = false
    const finish = (value: ResolvedName) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolveLookup(value)
    }
    const timer = setTimeout(() => finish({ kind: 'missing' }), timeoutMs)
    lookup(hostname, { all: true, verbatim: true })
      .then((records) => {
        const addresses = records.map((record) => record.address)
        if (addresses.length === 0) return finish({ kind: 'missing' })
        if (addresses.every((address) => isLoopbackAddress(address))) return finish({ kind: 'ready', addresses })
        return finish({ kind: 'conflict', addresses })
      })
      .catch((error: unknown) => {
        if (settled) return
        const code = systemErrorCode(error)
        if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'ENODATA') return finish({ kind: 'missing' })
        settled = true
        clearTimeout(timer)
        reject(error)
      })
  })
}

export async function resolveLocalName(
  hostname = LOCAL_PLAN_HOSTNAME,
  options?: { hostsPath?: string; lookupTimeoutMs?: number },
): Promise<ResolvedName> {
  const fromHosts = await resolutionFromHosts(options?.hostsPath ?? hostsFilePath(), hostname)
  if (fromHosts) return fromHosts
  return resolutionFromLookup(hostname, options?.lookupTimeoutMs ?? LOOKUP_TIMEOUT_MS)
}

function statusFromResolution(resolved: ResolvedName, hostname: string): LocalNameStatus {
  if (resolved.kind === 'ready') {
    return {
      outcome: 'ready',
      addresses: resolved.addresses,
      message: `${hostname} points at ${resolved.addresses.join(', ')}`,
    }
  }
  if (resolved.kind === 'conflict') {
    return {
      outcome: 'conflict',
      addresses: resolved.addresses,
      message: `${hostname} resolves to ${resolved.addresses.join(', ')}, which is not loopback. The hosts file was left unchanged.`,
    }
  }
  return {
    outcome: 'missing',
    addresses: [],
    message: `${hostname} does not resolve. Add "127.0.0.1 ${hostname}" to ${hostsFilePath()}, or run: sudo live-plan hostname install`,
  }
}

async function commandExit(command: string, args: string[], prompt: boolean): Promise<number> {
  const sudoArgs = prompt ? args : ['-n', ...args]
  return new Promise((resolveExit) => {
    const child = spawn(command, sudoArgs, { stdio: 'inherit' })
    child.on('error', () => resolveExit(1))
    child.on('exit', (code) => resolveExit(code ?? 1))
  })
}

async function elevateHostname(subcommand: 'apply' | 'unapply', elevate: Elevate): Promise<boolean> {
  if (elevate === 'never' || process.platform === 'win32') return false
  const entry = process.argv[1]
  if (!entry) return false
  const code = await commandExit(
    'sudo',
    [process.execPath, entry, 'hostname', subcommand, '--quiet'],
    elevate === 'prompt',
  )
  return code === 0
}

export async function ensureLocalHostname(options?: {
  hostsPath?: string
  hostname?: string
  elevate?: Elevate
  resolve?: boolean
}): Promise<LocalNameStatus> {
  const hostsPath = options?.hostsPath ?? hostsFilePath()
  const hostname = options?.hostname ?? LOCAL_PLAN_HOSTNAME
  const elevate = options?.elevate ?? 'never'
  const shouldResolve = options?.resolve ?? !options?.hostsPath

  if (shouldResolve) {
    const current = await resolveLocalName(hostname, { hostsPath })
    if (current.kind === 'ready' || current.kind === 'conflict') return statusFromResolution(current, hostname)
  }

  let wrote = await installHostsName(hostsPath, hostname)
  if (wrote === 'denied' && elevate !== 'never') {
    const elevated = await elevateHostname('apply', elevate)
    wrote = elevated ? 'added' : 'denied'
  }
  if (wrote === 'conflict') {
    return {
      outcome: 'conflict',
      addresses: [],
      message: `${hostname} is already mapped to a non-loopback address in ${hostsPath}.`,
    }
  }
  if (shouldResolve) {
    const again = await resolveLocalName(hostname, { hostsPath })
    if (again.kind === 'ready' || again.kind === 'conflict') return statusFromResolution(again, hostname)
    return statusFromResolution({ kind: 'missing' }, hostname)
  }
  if (wrote === 'denied') {
    return {
      outcome: 'missing',
      addresses: [],
      message: `Could not write ${hostsPath}. Re-run: sudo live-plan hostname apply`,
    }
  }
  return {
    outcome: 'ready',
    addresses: ['127.0.0.1'],
    message: wrote === 'added' ? `Added ${hostname} to ${hostsPath}` : `${hostname} is already in ${hostsPath}`,
  }
}

export async function removeLocalHostname(options?: {
  hostsPath?: string
  hostname?: string
  elevate?: Elevate
}): Promise<HostsWriteResult> {
  const hostsPath = options?.hostsPath ?? hostsFilePath()
  const hostname = options?.hostname ?? LOCAL_PLAN_HOSTNAME
  const elevate = options?.elevate ?? 'never'
  let result = await removeHostsName(hostsPath, hostname)
  if (result === 'denied' && elevate !== 'never') {
    const elevated = await elevateHostname('unapply', elevate)
    result = elevated ? 'removed' : 'denied'
  }
  return result
}

export type TcpForwarder = {
  port: number
  stop: () => Promise<void>
  done: Promise<void>
}

/** Copy TCP bytes from a loopback port to another loopback port. Used for HTTP on port 80. */
export async function startTcpForward(options: {
  listenPort: number
  targetPort: number
  ownerPid?: number
}): Promise<TcpForwarder> {
  const sockets = new Set<Socket>()
  const server = createServer((client) => {
    sockets.add(client)
    client.on('close', () => sockets.delete(client))
    const upstream = connect({ host: '127.0.0.1', port: options.targetPort })
    sockets.add(upstream)
    upstream.on('close', () => sockets.delete(upstream))
    const drop = () => {
      client.destroy()
      upstream.destroy()
    }
    client.on('error', drop)
    upstream.on('error', drop)
    client.pipe(upstream)
    upstream.pipe(client)
  })

  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(options.listenPort, '127.0.0.1', () => resolveListen())
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : options.listenPort

  let resolveDone: () => void = () => undefined
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve
  })
  server.on('close', () => resolveDone())

  const timer = setInterval(() => {
    if (!options.ownerPid) return
    try {
      process.kill(options.ownerPid, 0)
    } catch {
      void stop()
    }
  }, 1_000)
  timer.unref()

  async function stop(): Promise<void> {
    clearInterval(timer)
    for (const socket of sockets) socket.destroy()
    if (!server.listening) return
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()))
  }

  return { port, stop, done }
}

/** After binding a privileged port, continue as the user who invoked sudo. */
export function dropSudoPrivileges(): void {
  const gid = Number(process.env.SUDO_GID)
  const uid = Number(process.env.SUDO_UID)
  if (!Number.isInteger(uid) || uid <= 0) return
  const getgid = process.getgid
  const setgid = process.setgid
  const getuid = process.getuid
  const setuid = process.setuid
  if (!getgid || !setgid || !getuid || !setuid) {
    throw new Error('Cannot drop privileges after binding port 80')
  }
  if (Number.isInteger(gid) && gid > 0 && gid !== getgid()) setgid(gid)
  if (uid !== getuid()) setuid(uid)
}

async function healthPid(port: number): Promise<number | null> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(400),
    })
    if (!response.ok) return null
    const body = (await response.json()) as { ok?: boolean; pid?: number }
    if (body.ok !== true || typeof body.pid !== 'number') return null
    return body.pid
  } catch {
    return null
  }
}

async function waitForOwnHealth(port: number, timeoutMs: number): Promise<boolean> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if ((await healthPid(port)) === process.pid) return true
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50))
  }
  return false
}

export type Port80Exposure = {
  portless: boolean
  stop: () => Promise<void>
}

/**
 * Accept loopback HTTP on port 80 and hand it to the plan service.
 * An in-process listener is used when this process may bind port 80.
 * Otherwise a passwordless sudo helper binds it, drops privileges, and forwards bytes.
 */
export async function exposeLoopbackPort80(options: {
  app: FetchApp
  targetPort: number
}): Promise<Port80Exposure> {
  const idle: Port80Exposure = { portless: false, stop: async () => undefined }
  if (options.targetPort === LOOPBACK_HTTP_PORT) return { portless: true, stop: async () => undefined }

  try {
    const bound = bindElysiaAt(options.app, '127.0.0.1', LOOPBACK_HTTP_PORT)
    if (await waitForOwnHealth(LOOPBACK_HTTP_PORT, 1_000)) {
      return { portless: true, stop: bound.stop }
    }
    await bound.stop()
    return idle
  } catch (error) {
    const code = systemErrorCode(error)
    if (code !== 'EACCES' && code !== 'EPERM') return idle
  }

  const entry = process.argv[1]
  if (!entry || process.platform === 'win32') return idle
  const child = spawn(
    'sudo',
    [
      '-n',
      process.execPath,
      entry,
      'hostname',
      'forward',
      String(LOOPBACK_HTTP_PORT),
      String(options.targetPort),
      String(process.pid),
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  )
  let exited = false
  child.on('exit', () => {
    exited = true
  })
  child.on('error', () => {
    exited = true
  })

  async function stopChild(): Promise<void> {
    if (exited || child.exitCode !== null) return
    child.kill('SIGTERM')
    await new Promise<void>((resolveStop) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        resolveStop()
      }, 500)
      child.once('exit', () => {
        clearTimeout(timer)
        resolveStop()
      })
    })
  }

  const ready = await waitForOwnHealth(LOOPBACK_HTTP_PORT, 2_000)
  if (!ready) {
    await stopChild()
    return idle
  }
  return { portless: true, stop: stopChild }
}
