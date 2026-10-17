import { render } from '@semos-labs/glyph'
import { createElement } from 'react'
import { parsePeriod, type DashboardPeriod } from '../dashboard.js'
import { ensureRegistry, registryBindUrl } from '../registryClient.js'
import { DashboardApp } from './DashboardApp.js'

export type TuiOptions = {
  period: DashboardPeriod
  host?: string
  port?: number
}

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name)
  if (index === -1) return undefined
  return args[index + 1]
}

export function parseTuiArgs(args: string[]): TuiOptions | { error: string } {
  const raw = flag(args, '--period')
  if (raw != null && raw.startsWith('-')) return { error: 'period must be day, week, or month' }
  const period = raw == null ? 'day' : parsePeriod(raw)
  if (!period) return { error: 'period must be day, week, or month' }
  const portFlag = flag(args, '--registry-port') ?? flag(args, '--port')
  if (portFlag != null && portFlag.startsWith('-')) return { error: 'port must be a positive number' }
  const port = portFlag ? Number(portFlag) : undefined
  if (portFlag && (!Number.isFinite(port) || (port ?? 0) <= 0)) return { error: 'port must be a positive number' }
  const host = flag(args, '--registry-host') ?? flag(args, '--host')
  return {
    period,
    host,
    port: port !== undefined && Number.isFinite(port) && port > 0 ? port : undefined,
  }
}

export async function runTui(args: string[], entryFile: string): Promise<number> {
  const parsed = parseTuiArgs(args)
  if ('error' in parsed) {
    console.error(parsed.error)
    return 1
  }
  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    console.error('live-plan tui needs an interactive terminal.')
    return 1
  }
  let registry: Awaited<ReturnType<typeof ensureRegistry>>
  try {
    registry = await ensureRegistry({
      entryFile,
      port: parsed.port,
      host: parsed.host,
    })
  } catch (error) {
    console.error(`Registry unavailable: ${error instanceof Error ? error.message : error}`)
    return 1
  }
  render(
    createElement(DashboardApp, {
      registryUrl: registryBindUrl(registry),
      initialPeriod: parsed.period,
    }),
  )
  return 0
}
