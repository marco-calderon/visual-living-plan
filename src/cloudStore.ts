import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { defaultRegistryHome } from './configHome'

export type CloudAccount = {
  baseUrl: string
  token: string
}

export type CloudPlanRecord = {
  id: string
  url: string
  token: string
  planPath: string
  revision: number
  watchPid?: number
}

export type CloudFile = {
  account?: CloudAccount
  plans: Record<string, CloudPlanRecord>
}

function emptyFile(): CloudFile {
  return { plans: {} }
}

export function cloudFilePath(home = defaultRegistryHome()): string {
  return join(home, 'cloud.json')
}

export async function readCloudFile(home = defaultRegistryHome()): Promise<CloudFile> {
  try {
    const parsed = JSON.parse(await readFile(cloudFilePath(home), 'utf8')) as Partial<CloudFile>
    const plans = parsed.plans && typeof parsed.plans === 'object' ? parsed.plans : {}
    const account = parsed.account
    return {
      ...(account?.baseUrl && account.token ? { account: { baseUrl: normalizeBase(account.baseUrl), token: account.token } } : {}),
      plans,
    }
  } catch {
    return emptyFile()
  }
}

export async function writeCloudFile(file: CloudFile, home = defaultRegistryHome()): Promise<void> {
  const path = cloudFilePath(home)
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 })
  await chmod(path, 0o600).catch(() => undefined)
}

export function normalizeBase(baseUrl: string): string {
  const url = new URL(baseUrl)
  url.pathname = ''
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/$/, '')
}

export function planRecordForUrl(file: CloudFile, planUrl: string): CloudPlanRecord | undefined {
  let target: URL
  try {
    target = new URL(planUrl)
  } catch {
    return undefined
  }
  return Object.values(file.plans).find((plan) => {
    try {
      const stored = new URL(plan.url)
      return stored.origin === target.origin && stored.pathname.replace(/\/$/, '') === target.pathname.replace(/\/$/, '')
    } catch {
      return false
    }
  })
}

/** A URL on the hosted origin. `plan` carries the bearer. `account` means the origin matches but this checkout has no plan bearer. */
export function cloudCredential(
  file: CloudFile,
  planUrl: string,
): { kind: 'plan'; token: string } | { kind: 'account' } | null {
  const plan = planRecordForUrl(file, planUrl)
  if (plan) return { kind: 'plan', token: plan.token }
  if (!file.account) return null
  try {
    if (new URL(planUrl).origin === new URL(file.account.baseUrl).origin) return { kind: 'account' }
  } catch {
    return null
  }
  return null
}
