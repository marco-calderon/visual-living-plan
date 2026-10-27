import { render } from '@semos-labs/glyph'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { parsePeriod, type DashboardPeriod } from '../dashboard'
import { ensureRegistry, registryBindUrl } from '../registryClient'
import { DEFAULT_ACCENT, DEFAULT_CONFIG_FILENAME, loadThemeConfig } from '../theme'
import { DashboardApp } from './DashboardApp'

export type TuiOptions = {
  period: DashboardPeriod
  host?: string
  port?: number
}

export type RunTuiOptions = {
  /** When omitted, both stdin and stdout must be a TTY. */
  interactive?: boolean
  /** Registry home. Omit to use `LIVE_PLAN_HOME` or `~/.config/living-plan`. */
  home?: string
}

function flag(args: string[], name: string): { present: false } | { present: true; value?: string } {
  const index = args.indexOf(name)
  if (index === -1) return { present: false }
  const value = args[index + 1]
  if (value === undefined || value.startsWith('-')) return { present: true }
  return { present: true, value }
}

export function parseTuiArgs(args: string[]): TuiOptions | { error: string } {
  const raw = flag(args, '--period')
  if (raw.present && raw.value === undefined) return { error: 'period must be day, week, or month' }
  const period = !raw.present ? 'day' : parsePeriod(raw.value)
  if (!period) return { error: 'period must be day, week, or month' }

  const portFlag = flag(args, '--registry-port').present ? flag(args, '--registry-port') : flag(args, '--port')
  if (portFlag.present && portFlag.value === undefined) return { error: 'port must be a positive number' }
  const port = portFlag.present ? Number(portFlag.value) : undefined
  if (portFlag.present && (!Number.isFinite(port) || (port ?? 0) <= 0)) {
    return { error: 'port must be a positive number' }
  }

  const hostFlag = flag(args, '--registry-host').present ? flag(args, '--registry-host') : flag(args, '--host')
  if (hostFlag.present && hostFlag.value === undefined) return { error: 'host must be an address' }
  const host = hostFlag.present ? hostFlag.value : undefined

  return {
    period,
    host,
    port: port !== undefined && Number.isFinite(port) && port > 0 ? port : undefined,
  }
}

/**
 * Open the terminal registry.
 * Starts the shared plan service when it is not already running.
 * Quitting exits this client and leaves that service running.
 */
export async function runTui(args: string[], entryFile: string, options: RunTuiOptions = {}): Promise<number> {
  const parsed = parseTuiArgs(args)
  if ('error' in parsed) {
    console.error(parsed.error)
    return 1
  }
  const interactive = options.interactive ?? (Boolean(process.stdout.isTTY) && Boolean(process.stdin.isTTY))
  if (!interactive) {
    console.error('live-plan tui needs an interactive terminal.')
    return 1
  }
  let registry: Awaited<ReturnType<typeof ensureRegistry>>
  try {
    registry = await ensureRegistry({
      entryFile,
      home: options.home,
      port: parsed.port,
      host: parsed.host,
    })
  } catch (error) {
    console.error(`Registry unavailable: ${error instanceof Error ? error.message : error}`)
    return 1
  }

  let accent = DEFAULT_ACCENT
  try {
    accent = (await loadThemeConfig(resolve(DEFAULT_CONFIG_FILENAME))).accent
  } catch (error) {
    console.error(`Theme config: ${error instanceof Error ? error.message : error}`)
    return 1
  }

  render(
    createElement(DashboardApp, {
      registryUrl: registryBindUrl(registry),
      initialPeriod: parsed.period,
      accent,
      // Exit this client only. The service was started detached and is not signaled.
      onQuit: () => process.exit(0),
    }),
  )
  return 0
}
