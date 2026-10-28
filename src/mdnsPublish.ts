import { spawn, type ChildProcess } from 'node:child_process'
import { createSocket, type Socket } from 'node:dgram'
import { networkInterfaces } from 'node:os'
import { detectDefaultInterface, nicsFromNetworkInterfaces, selectLanAddress } from './lanAddress'
import { isWildcardHost, removeLanRuntime, writeLanRuntime, type LanRuntime } from './lanConfig'
import { isLoopbackHost } from './localName'
import { recordLog } from './serviceLog'
import {
  MDNS_HOST,
  MDNS_INSTANCE,
  MDNS_PRODUCT,
  MDNS_SERVICE,
  announcementPacket,
  chooseMdnsBackend,
  goodbyePacket,
  responseForQuery,
  type ServiceAnnouncement,
} from './mdnsPacket'

let publishAttempts = 0

export function mdnsPublishAttempts(): number {
  return publishAttempts
}

function noteAttempt(): void {
  publishAttempts += 1
}

export type LanPublisher = {
  publishing: boolean
  stop: () => Promise<void>
}

const NO_ADDRESS = 'This machine has no private LAN address to advertise.'

function serviceFor(port: number, address: string): ServiceAnnouncement {
  return {
    instance: MDNS_INSTANCE,
    service: MDNS_SERVICE,
    host: MDNS_HOST,
    product: MDNS_PRODUCT,
    port,
    address,
  }
}

function udpPortBusy(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createSocket({ type: 'udp4', reuseAddr: false })
    let settled = false
    const finish = (busy: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(busy)
    }
    const timer = setTimeout(() => {
      try {
        socket.close()
      } catch {
        // The socket never opened.
      }
      finish(true)
    }, 1_000)
    socket.once('error', () => {
      try {
        socket.close()
      } catch {
        // Already closed.
      }
      finish(true)
    })
    socket.bind(port, () => {
      socket.close(() => finish(false))
    })
  })
}

function commandOk(command: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'ignore' })
    child.once('error', () => resolve(false))
    child.once('exit', (code) => resolve(code === 0))
  })
}

async function warn(message: string, detail?: string): Promise<void> {
  await recordLog({ level: 'warn', message, detail, source: 'lan', echo: false }).catch(() => undefined)
}

function sendTo(socket: Socket, packet: Buffer, port: number, address: string): Promise<void> {
  return new Promise((resolve) => {
    socket.send(packet, port, address, () => resolve())
  })
}

async function stopChildren(children: ChildProcess[]): Promise<void> {
  for (const child of children) {
    if (child.exitCode !== null) continue
    try {
      child.kill('SIGINT')
    } catch {
      // The helper already exited.
    }
  }
  const deadline = Date.now() + 400
  while (children.some((child) => child.exitCode === null) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  for (const child of children) {
    if (child.exitCode !== null) continue
    try {
      child.kill('SIGTERM')
    } catch {
      // The helper already exited.
    }
  }
}

function listenProcess(service: ServiceAnnouncement, address: string): Promise<{ stop: () => Promise<void> }> {
  const ipv6 = address.includes(':')
  const socket = createSocket({ type: ipv6 ? 'udp6' : 'udp4', reuseAddr: true })
  const group = ipv6 ? 'ff02::fb' : '224.0.0.251'
  noteAttempt()
  return new Promise((resolve, reject) => {
    const fail = (error: Error) => {
      try {
        socket.close()
      } catch {
        // Not bound yet.
      }
      reject(error)
    }
    socket.once('error', fail)
    socket.bind(5353, () => {
      socket.off('error', fail)
      socket.on('error', (error) => {
        void warn('mDNS socket error', error.message)
      })
      try {
        socket.addMembership(group)
        socket.setMulticastTTL(255)
      } catch {
        // Membership can fail when the interface is not ready. Direct replies still work.
      }
      const announce = announcementPacket(service)
      const repeat = setTimeout(() => {
        void sendTo(socket, announce, 5353, group)
      }, 1_000)
      repeat.unref?.()
      socket.on('message', (message, rinfo) => {
        const response = responseForQuery(message, service)
        if (!response) return
        void sendTo(socket, response, rinfo.port, rinfo.address)
      })
      void sendTo(socket, announce, 5353, group)
      resolve({
        async stop() {
          clearTimeout(repeat)
          try {
            await sendTo(socket, goodbyePacket(service), 5353, group)
          } catch {
            // The socket is already closing.
          }
          await new Promise<void>((done) => {
            try {
              socket.close(() => done())
            } catch {
              done()
            }
          })
        },
      })
    })
  })
}

async function spawnHelper(command: string, args: string[]): Promise<ChildProcess> {
  noteAttempt()
  const child = spawn(command, args, { stdio: 'ignore' })
  const failed = await new Promise<Error | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), 400)
    child.once('error', (error) => {
      clearTimeout(timer)
      resolve(error instanceof Error ? error : new Error(String(error)))
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      resolve(new Error(`${command} exited ${code ?? 'unknown'}`))
    })
  })
  if (failed) throw failed
  return child
}

async function startBackend(service: ServiceAnnouncement, address: string): Promise<{ backend: LanRuntime['backend']; stop: () => Promise<void> }> {
  const busy = await udpPortBusy(5353)
  const avahi = process.platform === 'linux' ? await commandOk('avahi-daemon', ['--check']) : false
  const backend = chooseMdnsBackend({ platform: process.platform, udp5353OwnedBySystem: busy, avahiRunning: avahi })
  const port = String(service.port)
  const txt = [`port=${service.port}`, `product=${MDNS_PRODUCT}`]
  if (backend === 'dns-sd') {
    const child = await spawnHelper('dns-sd', ['-P', MDNS_INSTANCE, MDNS_SERVICE, 'local', port, MDNS_HOST, address, ...txt])
    return { backend, stop: async () => stopChildren([child]) }
  }
  if (backend === 'avahi') {
    const addressChild = await spawnHelper('avahi-publish', ['-a', MDNS_HOST, address])
    const serviceChild = await spawnHelper('avahi-publish', [
      '-s',
      '-H',
      MDNS_HOST,
      MDNS_INSTANCE,
      MDNS_SERVICE,
      port,
      ...txt,
    ])
    return { backend, stop: async () => stopChildren([addressChild, serviceChild]) }
  }
  if (busy) {
    throw new Error('UDP 5353 is already in use and no mDNS daemon is available')
  }
  const listener = await listenProcess(service, address)
  return { backend: 'process', stop: listener.stop }
}

export async function attachLanPublisher(options: {
  enabled: boolean
  advertise: boolean
  bindHost: string
  port: number
  home: string
}): Promise<LanPublisher> {
  if (!options.enabled || !options.advertise) {
    return { publishing: false, stop: async () => {} }
  }
  const nics = nicsFromNetworkInterfaces(networkInterfaces())
  const explicit = isWildcardHost(options.bindHost) || isLoopbackHost(options.bindHost) ? null : options.bindHost
  let address: string | null = null
  try {
    address = selectLanAddress(nics, await detectDefaultInterface(nics), explicit)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not choose a LAN address'
    await warn(message)
    await writeLanRuntime(options.home, {
      pid: process.pid,
      address: null,
      port: options.port,
      backend: 'none',
      error: message,
    }).catch(() => undefined)
    return {
      publishing: false,
      async stop() {
        await removeLanRuntime(options.home)
      },
    }
  }
  if (!address) {
    await warn(NO_ADDRESS)
    await writeLanRuntime(options.home, {
      pid: process.pid,
      address: null,
      port: options.port,
      backend: 'none',
      error: NO_ADDRESS,
    }).catch(() => undefined)
    return {
      publishing: false,
      async stop() {
        await removeLanRuntime(options.home)
      },
    }
  }
  try {
    const started = await startBackend(serviceFor(options.port, address), address)
    await writeLanRuntime(options.home, {
      pid: process.pid,
      address,
      port: options.port,
      backend: started.backend,
    })
    return {
      publishing: true,
      async stop() {
        await Promise.race([
          started.stop(),
          new Promise((resolve) => setTimeout(resolve, 500)),
        ])
        await removeLanRuntime(options.home)
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not advertise the plan service'
    await warn('Could not advertise the plan service', message)
    await writeLanRuntime(options.home, {
      pid: process.pid,
      address: null,
      port: options.port,
      backend: 'none',
      error: message,
    }).catch(() => undefined)
    return {
      publishing: false,
      async stop() {
        await removeLanRuntime(options.home)
      },
    }
  }
}
