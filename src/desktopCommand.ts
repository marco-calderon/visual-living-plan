/**
 * `live-plan desktop` and `live-plan skills`: what the desktop app's setup screen runs ([ADR 0038]).
 *
 *   desktop state                 one JSON line: the app's config, what setup can offer, and the
 *                                 release notes to show when this is a newer minor ([ADR 0042])
 *   desktop configure --json {}   change the config, then print the same line
 *   desktop install-cli           put `live-plan` on the PATH, running this install
 *   skills list                   where the live-plan skill is and is not installed
 *   skills install                copy the skill into agent harnesses
 *
 * The app keeps no logic of its own for these. It runs the CLI it ships and shows the answer.
 *
 * [ADR 0038]: ../docs/architecture/decisions/0038-desktop-setup-and-cloud.md
 * [ADR 0042]: ../docs/architecture/decisions/0042-update-notices-and-whats-new.md
 */
import { AGENT_HARNESSES, harnessStatuses, installSkill, type HarnessStatus } from './agentSkills'
import { currentLauncherEnv, installLauncher, launcherStatus, type LauncherStatus, type LauncherTarget } from './cliLauncher'
import { loadVersionNotes } from './changelog'
import { readCloudFile } from './cloudStore'
import { globalThemeConfigPath } from './configHome'
import {
  mergeDesktopConfig,
  readDesktopConfig,
  writeDesktopConfig,
  type DesktopConfig,
  type DesktopConfigPatch,
} from './desktopConfig'
import { DIFFS_THEME_PRESETS, type DiffsThemeSample } from './diffsTheme'
import { notesDue, whatsNew, type WhatsNew } from './releaseNotes'
import { ACCENT_PRESETS, loadThemeConfig, saveThemeConfig } from './theme'

export type DesktopState = {
  version: string
  config: DesktopConfig
  /** The hosted app the window opens in cloud mode: the configured host, else the one the CLI is signed in to. */
  cloudUrl: string | null
  /** The look plans on this machine start with. */
  theme: { accent: string; diffsTheme: string }
  cli: LauncherStatus
  harnesses: HarnessStatus[]
  accents: Array<{ label: string; accent: string }>
  syntaxThemes: Array<{ id: string; label: string; description: string; light: DiffsThemeSample; dark: DiffsThemeSample }>
  /** Release notes the app shows once, when this version is a newer minor than the last notes seen. */
  whatsNew: WhatsNew | null
}

export type DesktopCommandContext = {
  version: string
  target: LauncherTarget
  /** The `docs/changelogs` directory beside this install. What's new reads it. */
  changelogs?: string
}

/** The notes due at this version. Only after setup, and only past the minor whose notes were seen. */
export function dueWhatsNew(config: DesktopConfig, context: Pick<DesktopCommandContext, 'version' | 'changelogs'>): WhatsNew | null {
  // Only a newer minor reads the changelog files.
  if (!config.setupDone || !context.changelogs || !notesDue(context.version, config.notesSeen)) return null
  return whatsNew(context.version, config.notesSeen, loadVersionNotes(context.changelogs))
}

async function signedInCloudUrl(): Promise<string | null> {
  return (await readCloudFile()).account?.baseUrl ?? null
}

export async function desktopState(context: DesktopCommandContext): Promise<DesktopState> {
  const [config, signedIn, theme, env, harnesses] = await Promise.all([
    readDesktopConfig(),
    signedInCloudUrl(),
    loadThemeConfig(globalThemeConfigPath()),
    currentLauncherEnv(),
    harnessStatuses(),
  ])
  return {
    version: context.version,
    config,
    cloudUrl: config.cloudUrl ?? signedIn,
    theme: { accent: theme.accent, diffsTheme: theme.diffsTheme },
    cli: launcherStatus(context.target, env),
    harnesses,
    accents: ACCENT_PRESETS.map((preset) => ({ label: preset.label, accent: preset.accent })),
    syntaxThemes: DIFFS_THEME_PRESETS.map((preset) => ({
      id: preset.id,
      label: preset.label,
      description: preset.description,
      light: preset.lightSample,
      dark: preset.darkSample,
    })),
    whatsNew: dueWhatsNew(config, context),
  }
}

/** Save a change from setup. A new accent or syntax theme also becomes the machine-wide theme file. */
export async function configureDesktop(patch: DesktopConfigPatch, options: { version?: string } = {}): Promise<DesktopConfig> {
  const current = await readDesktopConfig()
  const next = mergeDesktopConfig(current, patch, { fallbackCloudUrl: await signedInCloudUrl(), version: options.version })
  await writeDesktopConfig(next)
  if (next.appearance && next.appearance.savedAt !== current.appearance?.savedAt) {
    const path = globalThemeConfigPath()
    const theme = await loadThemeConfig(path)
    await saveThemeConfig(path, { ...theme, accent: next.appearance.accent, diffsTheme: next.appearance.diffsTheme })
  }
  return next
}

function flagValues(args: string[], name: string): string[] {
  const values: string[] = []
  for (let index = 0; index < args.length - 1; index += 1) {
    if (args[index] === name) values.push(args[index + 1] ?? '')
  }
  return values
}

function fail(error: unknown): number {
  console.error(error instanceof Error ? error.message : String(error))
  return 1
}

const DESKTOP_USAGE = `Usage: live-plan desktop <state | configure --json '{"mode":"cloud"}' | install-cli>`

export async function cmdDesktop(args: string[], context: DesktopCommandContext): Promise<number> {
  const action = args[0]
  try {
    if (action === 'state') {
      console.log(JSON.stringify(await desktopState(context)))
      return 0
    }
    if (action === 'configure') {
      const raw = flagValues(args, '--json')[0]
      if (!raw) {
        console.error(DESKTOP_USAGE)
        return 1
      }
      let patch: unknown
      try {
        patch = JSON.parse(raw)
      } catch {
        console.error('--json is not JSON.')
        return 1
      }
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        console.error('--json must be an object.')
        return 1
      }
      await configureDesktop(patch as DesktopConfigPatch, { version: context.version })
      console.log(JSON.stringify(await desktopState(context)))
      return 0
    }
    if (action === 'install-cli') {
      const status = await installLauncher(context.target, await currentLauncherEnv())
      if (args.includes('--json')) console.log(JSON.stringify(status))
      else {
        console.log(`Installed live-plan to ${status.path}`)
        if (status.hint) console.log(`That folder is not on your PATH. Add this line to your shell profile:\n  ${status.hint}`)
      }
      return 0
    }
  } catch (error) {
    return fail(error)
  }
  console.error(DESKTOP_USAGE)
  return 1
}

const SKILLS_USAGE = `Usage: live-plan skills <list | install [--harness <id>]... [--all]> [--json]
Harnesses: ${AGENT_HARNESSES.map((harness) => harness.id).join(', ')}
install with no --harness copies the skill into every harness found on this machine.`

function describe(status: HarnessStatus): string {
  const state = status.current ? 'installed' : status.installed ? 'installed, older copy' : status.detected ? 'not installed' : 'not found on this machine'
  return `${status.id.padEnd(12)} ${state.padEnd(26)} ${status.path}`
}

export async function cmdSkills(args: string[]): Promise<number> {
  const action = args[0]
  const json = args.includes('--json')
  try {
    if (action === 'list') {
      const statuses = await harnessStatuses()
      if (json) console.log(JSON.stringify(statuses))
      else for (const status of statuses) console.log(describe(status))
      return 0
    }
    if (action === 'install') {
      const ids = args.includes('--all') ? AGENT_HARNESSES.map((harness) => harness.id) : flagValues(args, '--harness')
      const installed = await installSkill(ids)
      if (json) console.log(JSON.stringify(installed))
      else if (installed.length === 0) {
        console.log('No agent harness was found on this machine. Name one with --harness, or pass --all.')
      } else for (const status of installed) console.log(`Installed the live-plan skill to ${status.path}`)
      return 0
    }
  } catch (error) {
    return fail(error)
  }
  console.error(SKILLS_USAGE)
  return 1
}
