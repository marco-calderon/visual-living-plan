/**
 * Install the `live-plan` skill where coding agents look for skills (`live-plan skills install`).
 *
 * The skill ships in the package as `skills/live-plan`, beside `dist/`. Each harness reads skills
 * from a folder under the home directory, one folder per skill with a `SKILL.md`. An install
 * replaces this skill's folder and leaves every other skill in place.
 */
import { cp, mkdir, readFile, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SKILL_NAME = 'live-plan'

export type AgentHarness = {
  id: string
  label: string
  /** The harness's own folder under home. When it exists, the harness is in use on this machine. */
  home: string
  /** The skills folder under home. */
  skills: string
}

export const AGENT_HARNESSES: readonly AgentHarness[] = [
  { id: 'claude-code', label: 'Claude Code', home: '.claude', skills: '.claude/skills' },
  { id: 'codex', label: 'Codex', home: '.codex', skills: '.codex/skills' },
  { id: 'cursor', label: 'Cursor', home: '.cursor', skills: '.cursor/skills' },
  { id: 'gemini', label: 'Gemini CLI', home: '.gemini', skills: '.gemini/skills' },
  { id: 'opencode', label: 'OpenCode', home: '.config/opencode', skills: '.config/opencode/skills' },
  { id: 'agents', label: 'Other agents (~/.agents)', home: '.agents', skills: '.agents/skills' },
]

export type HarnessStatus = {
  id: string
  label: string
  /** Where the skill is, or would be, installed. */
  path: string
  /** The harness has a folder on this machine. */
  detected: boolean
  installed: boolean
  /** The installed `SKILL.md` is the one this package ships. */
  current: boolean
}

/** `skills/live-plan` in the package that holds this module (`dist/cli.js` or `src/`). */
export function bundledSkillDir(moduleUrl: string = import.meta.url): string {
  return join(resolve(dirname(fileURLToPath(moduleUrl)), '..'), 'skills', SKILL_NAME)
}

export function harnessById(id: string): AgentHarness | undefined {
  return AGENT_HARNESSES.find((harness) => harness.id === id)
}

export function skillPath(harness: AgentHarness, home = homedir()): string {
  return join(home, ...harness.skills.split('/'), SKILL_NAME)
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

export type SkillsOptions = { home?: string; source?: string }

export async function harnessStatuses(options: SkillsOptions = {}): Promise<HarnessStatus[]> {
  const home = options.home ?? homedir()
  const shipped = await readText(join(options.source ?? bundledSkillDir(), 'SKILL.md'))
  return Promise.all(
    AGENT_HARNESSES.map(async (harness) => {
      const path = skillPath(harness, home)
      const installed = await readText(join(path, 'SKILL.md'))
      return {
        id: harness.id,
        label: harness.label,
        path,
        detected: await isDirectory(join(home, ...harness.home.split('/'))),
        installed: installed !== null,
        current: installed !== null && installed === shipped,
      }
    }),
  )
}

/**
 * Copy the skill into each named harness. With no ids, into every harness found on this machine.
 * Throws when an id is unknown or the package does not carry the skill.
 */
export async function installSkill(ids: readonly string[], options: SkillsOptions = {}): Promise<HarnessStatus[]> {
  const home = options.home ?? homedir()
  const source = options.source ?? bundledSkillDir()
  if ((await readText(join(source, 'SKILL.md'))) === null) {
    throw new Error(`The ${SKILL_NAME} skill is missing from this install (${source}).`)
  }
  const unknown = ids.filter((id) => !harnessById(id))
  if (unknown.length) {
    throw new Error(`Unknown harness: ${unknown.join(', ')}. Choose from ${AGENT_HARNESSES.map((harness) => harness.id).join(', ')}.`)
  }
  const wanted = ids.length
    ? new Set(ids)
    : new Set((await harnessStatuses({ home, source })).filter((status) => status.detected).map((status) => status.id))
  for (const harness of AGENT_HARNESSES) {
    if (!wanted.has(harness.id)) continue
    const destination = skillPath(harness, home)
    await mkdir(dirname(destination), { recursive: true })
    await rm(destination, { recursive: true, force: true })
    await cp(source, destination, { recursive: true })
  }
  return (await harnessStatuses({ home, source })).filter((status) => wanted.has(status.id))
}
