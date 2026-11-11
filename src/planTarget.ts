import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { cloudIdInSource } from './cloudFrontmatter'
import { readCloudFile } from './cloudStore'
import { planIdForPath } from './planId'
import { defaultRegistryHome, listProcesses, readRegistryLock, registryBindUrl } from './registryClient'
import { DEFAULT_REGISTRY_HOST, DEFAULT_REGISTRY_PORT } from './registryConstants'

/** Flags that take no value. Any other `--flag` is followed by its value. */
const SWITCHES = new Set([
  '--any',
  '--cloud',
  '--detach',
  '--follow',
  '--fuzzy',
  '--headless',
  '--json',
  '--keep-open',
  '--listen',
  '--no-open',
  '--no-registry',
  '--open',
])

/** The arguments that are neither a flag nor a flag's value. */
export function positionalArgs(args: string[]): string[] {
  const positional: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? ''
    if (arg.startsWith('-')) {
      if (!SWITCHES.has(arg) && !arg.includes('=')) index += 1
      continue
    }
    positional.push(arg)
  }
  return positional
}

/** The plan file a command was given: `--plan <file>`, or a `.md` path among its arguments. */
export function planFileArg(args: string[]): string | undefined {
  const index = args.indexOf('--plan')
  if (index !== -1) return args[index + 1]
  return positionalArgs(args).find((arg) => /\.md$/i.test(arg))
}

/**
 * The plan URL a command acts on. `--url` wins. Otherwise the plan file, given as `--plan <file>` or
 * as a `.md` path among the arguments, maps to:
 *
 * - its hosted URL, when this machine served it with `--cloud` (the record in `cloud.json`, found by
 *   the `cloudId` in the file or by its path);
 * - its URL on this machine's service otherwise. The service lists it by path while it runs, and the
 *   same path always maps to the same plan id, so the URL is known even while the service is down.
 *
 * Returns null when the command was given neither. Throws when the file does not exist.
 */
export async function resolvePlanUrl(args: string[], home = defaultRegistryHome()): Promise<string | null> {
  const index = args.indexOf('--url')
  if (index !== -1) return args[index + 1] ?? null
  const file = planFileArg(args)
  if (!file) return null
  const planPath = resolve(file)
  let source: string
  try {
    source = await readFile(planPath, 'utf8')
  } catch {
    throw new Error(`No plan file at ${planPath}. Pass the plan file you served, or --url <plan-url>.`)
  }
  const cloud = await readCloudFile(home)
  const cloudId = cloudIdInSource(source)
  const hosted =
    (cloudId ? cloud.plans[cloudId] : undefined) ??
    Object.values(cloud.plans).find((record) => record.planPath && resolve(record.planPath) === planPath)
  if (hosted?.url) return hosted.url
  return localPlanUrl(planPath, home)
}

async function localPlanUrl(planPath: string, home: string): Promise<string> {
  const lock = await readRegistryLock(home)
  const base = lock ? registryBindUrl(lock) : `http://${DEFAULT_REGISTRY_HOST}:${DEFAULT_REGISTRY_PORT}`
  if (lock) {
    try {
      const listed = (await listProcesses(base)).find((record) => record.planPath && resolve(record.planPath) === planPath)
      if (listed?.url) return listed.url
    } catch {
      // The service is down or busy. The id below is the one it gives this path.
    }
  }
  return `${base}/plans/${planIdForPath(planPath)}/`
}
