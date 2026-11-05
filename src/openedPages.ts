import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { defaultRegistryHome } from './configHome'

/**
 * Plan pages the CLI has already opened in a browser.
 * `serve` and `review` open a plan page only the first time, so stopping and
 * resuming an agent does not pile up tabs.
 */
type OpenedFile = { pages: Record<string, string> }

export type OpenChoice = 'open' | 'skip'

export function openedPagesPath(home = defaultRegistryHome()): string {
  return join(home, 'opened-pages.json')
}

/** The page identity: origin and path, without query or hash. */
export function pageKey(url: string): string {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname.endsWith('/') ? parsed.pathname : `${parsed.pathname}/`
    return `${parsed.origin}${path}`
  } catch {
    return url
  }
}

async function readOpened(home: string): Promise<OpenedFile> {
  try {
    const parsed = JSON.parse(await readFile(openedPagesPath(home), 'utf8')) as Partial<OpenedFile>
    return { pages: parsed.pages && typeof parsed.pages === 'object' ? parsed.pages : {} }
  } catch {
    return { pages: {} }
  }
}

export async function wasPageOpened(url: string, home = defaultRegistryHome()): Promise<boolean> {
  const file = await readOpened(home)
  return Boolean(file.pages[pageKey(url)])
}

export async function rememberPageOpened(url: string, home = defaultRegistryHome(), now = new Date()): Promise<void> {
  const file = await readOpened(home)
  file.pages[pageKey(url)] = now.toISOString()
  const path = openedPagesPath(home)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, 'utf8')
}

/**
 * `--no-open` never opens. `--open` always opens. Otherwise a plan page opens
 * only when this machine has not opened it before.
 */
export async function choosePlanOpen(
  url: string,
  flags: { noOpen: boolean; forceOpen: boolean },
  home = defaultRegistryHome(),
): Promise<OpenChoice> {
  if (flags.noOpen) return 'skip'
  if (flags.forceOpen) return 'open'
  return (await wasPageOpened(url, home)) ? 'skip' : 'open'
}
