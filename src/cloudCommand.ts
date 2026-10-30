import { spawn } from 'node:child_process'
import { access, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { loginCloudAccount, registerCloudPlan, uploadJson, uploadSource } from './cloudClient'
import { cloudIdInSource, sourceWithCloudId } from './cloudFrontmatter'
import { readCloudFile, writeCloudFile, type CloudAccount, type CloudPlanRecord } from './cloudStore'
import { uploadPlanRecord, watchPlanFile } from './cloudWatch'
import { readGitSnapshot } from './gitStatus'
import { parsePlan } from './parse'
import { isPidAlive } from './pid'
import { configPathBesidePlan, loadThemeConfig } from './theme'
export function cloudFlagConflict(cloud: boolean, noRegistry: boolean): string | null {
  if (cloud && noRegistry) return '--cloud cannot be combined with --no-registry.'
  return null
}

export async function requireCloudAccount(home?: string): Promise<CloudAccount> {
  const file = await readCloudFile(home)
  if (!file.account) {
    throw new Error('No hosted account. Run live-plan account login --url https://your-host')
  }
  return file.account
}

export async function signInToCloud(baseUrl: string, open: (url: string) => Promise<void>, home?: string): Promise<void> {
  const account = await loginCloudAccount(baseUrl, open)
  const file = await readCloudFile(home)
  file.account = account
  await writeCloudFile(file, home)
}

export async function prepareCloudPlan(options: {
  planPath: string
  mode: 'watch' | 'review'
  home?: string
}): Promise<CloudPlanRecord> {
  const account = await requireCloudAccount(options.home)
  const planPath = resolve(options.planPath)
  let markdown = await readFile(planPath, 'utf8')
  let title = basename(planPath)
  try {
    title = parsePlan(markdown, planPath).title
  } catch {
    // The host still stores the file. The page shows the parse error in the client.
  }
  const existingId = cloudIdInSource(markdown) ?? undefined
  const registered = await registerCloudPlan(account.baseUrl, account.token, {
    cloudId: existingId,
    mode: options.mode,
    title,
    markdown,
  })
  const next = sourceWithCloudId(markdown, registered.id)
  if (next !== markdown) {
    await writeFile(planPath, next)
    markdown = next
  }
  const record: CloudPlanRecord = {
    id: registered.id,
    url: registered.url,
    token: registered.token,
    planPath,
    revision: registered.revision,
  }
  const file = await readCloudFile(options.home)
  file.plans[record.id] = record
  await writeCloudFile(file, options.home)
  const revision = await uploadSource({
    planUrl: record.url,
    token: record.token,
    markdown,
    revision: record.revision,
    title,
  })
  record.revision = revision
  file.plans[record.id] = record
  await writeCloudFile(file, options.home)
  const themePath = configPathBesidePlan(planPath)
  try {
    await access(themePath)
    await uploadJson(record.url, record.token, 'theme', await loadThemeConfig(themePath))
  } catch {
    // A missing theme file keeps the host default.
  }
  try {
    await uploadJson(record.url, record.token, 'git', readGitSnapshot(dirname(planPath)))
  } catch {
    // Git status is display data.
  }
  return record
}

export function spawnCloudWatch(entryFile: string, record: CloudPlanRecord, home?: string): number {
  const child = spawn(process.execPath, [entryFile, 'cloud-watch', '--url', record.url], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      LIVE_PLAN_DAEMON: '1',
      ...(home ? { LIVE_PLAN_HOME: home } : {}),
    },
  })
  child.unref()
  return child.pid ?? 0
}

export async function runCloudWatch(planUrl: string, home?: string): Promise<void> {
  const file = await readCloudFile(home)
  const record = Object.values(file.plans).find((plan) => plan.url === planUrl)
  if (!record) throw new Error('No hosted plan is stored for that URL.')
  const controller = new AbortController()
  const stop = () => controller.abort()
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  await uploadPlanRecord(record, home)
  const fresh = await readCloudFile(home)
  const current = fresh.plans[record.id] ?? record
  watchPlanFile({ record: current, home, signal: controller.signal })
  await new Promise<void>((resolveWait) => {
    controller.signal.addEventListener('abort', () => resolveWait())
  })
}

export async function syncCloudUrl(planUrl: string, home?: string): Promise<() => void> {
  const file = await readCloudFile(home)
  const record = Object.values(file.plans).find((plan) => {
    try {
      const left = new URL(plan.url)
      const right = new URL(planUrl)
      return left.origin === right.origin && left.pathname.replace(/\/$/, '') === right.pathname.replace(/\/$/, '')
    } catch {
      return false
    }
  })
  if (!record) return () => undefined
  const revision = await uploadPlanRecord(record, home)
  const controller = new AbortController()
  watchPlanFile({ record: { ...record, revision }, home, signal: controller.signal })
  return () => controller.abort()
}

export function stopCloudWatch(pid: number | undefined): void {
  if (!pid || !isPidAlive(pid)) return
  try {
    process.kill(pid)
  } catch {
    // The uploader already exited.
  }
}
