import { watch, type FSWatcher } from 'node:fs'
import { access, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { uploadJson, uploadSource } from './cloudClient'
import { readCloudFile, writeCloudFile, type CloudPlanRecord } from './cloudStore'
import { readGitSnapshot } from './gitStatus'
import { configPathBesidePlan, loadThemeConfig } from './theme'

async function rememberRevision(record: CloudPlanRecord, revision: number, home?: string): Promise<void> {
  const file = await readCloudFile(home)
  const current = file.plans[record.id]
  if (!current) return
  file.plans[record.id] = { ...current, revision }
  await writeCloudFile(file, home)
}

/** PUT the plan file, theme, and git snapshot. A stale revision is retried once. */
export async function uploadPlanRecord(record: CloudPlanRecord, home?: string): Promise<number> {
  const markdown = await readFile(record.planPath, 'utf8')
  const revision = await uploadSource({
    planUrl: record.url,
    token: record.token,
    markdown,
    revision: record.revision,
  })
  await rememberRevision(record, revision, home)
  const themePath = configPathBesidePlan(record.planPath)
  try {
    await access(themePath)
    await uploadJson(record.url, record.token, 'theme', await loadThemeConfig(themePath))
  } catch {
    // Theme is display data. A missing config does not stop the upload.
  }
  try {
    await uploadJson(record.url, record.token, 'git', readGitSnapshot(dirname(record.planPath)))
  } catch {
    // Git status is display data. The page still opens without it.
  }
  return revision
}

/**
 * Watch the plan file and upload it after a short pause.
 * This process is not an HTTP server.
 */
export function watchPlanFile(options: {
  record: CloudPlanRecord
  home?: string
  signal: AbortSignal
}): void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let revision = options.record.revision
  const schedule = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      void readFile(options.record.planPath, 'utf8')
        .then((markdown) =>
          uploadSource({
            planUrl: options.record.url,
            token: options.record.token,
            markdown,
            revision,
          }),
        )
        .then(async (next) => {
          revision = next
          await rememberRevision({ ...options.record, revision }, next, options.home)
        })
        .catch((error: unknown) => {
          console.error(error instanceof Error ? error.message : error)
        })
    }, 300)
  }
  const watchers: FSWatcher[] = []
  const arm = (path: string) => {
    try {
      watchers.push(watch(path, schedule))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      console.error(error instanceof Error ? error.message : error)
    }
  }
  arm(options.record.planPath)
  arm(configPathBesidePlan(options.record.planPath))
  options.signal.addEventListener('abort', () => {
    if (timer) clearTimeout(timer)
    for (const watcher of watchers) watcher.close()
  })
}
