#!/usr/bin/env node
/**
 * Copy this repo's skills into the user skills folder, ~/.agents/skills.
 *
 * Skills this repository authors live in `skills/` and `.cursor/skills/`.
 * Third-party skills already checked out under `.agents/skills` are left alone.
 * A skill already present in the destination is replaced, so running this
 * again refreshes those copies and does not create a second folder.
 * Other skills already in ~/.agents/skills are not removed.
 *
 * LIVE_PLAN_SKILLS_DIR overrides the destination. It is for tests. The
 * default is the home directory, not a folder inside this repo.
 */
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

const skillRoots = [join(root, 'skills'), join(root, '.cursor', 'skills')]

export function skillsDestination(override = process.env.LIVE_PLAN_SKILLS_DIR) {
  if (override && override.trim()) return resolve(override)
  return join(homedir(), '.agents', 'skills')
}

export async function listProjectSkills() {
  const skills = []
  for (const dir of skillRoots) {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch (error) {
      if (error && /** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') continue
      throw error
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const source = join(dir, entry.name)
      try {
        await stat(join(source, 'SKILL.md'))
      } catch (error) {
        if (error && /** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') continue
        throw error
      }
      skills.push({ name: entry.name, source })
    }
  }
  return skills
}

/** Replace each project skill in `destDir`. Safe to call more than once. */
export async function installProjectSkills(destDir = skillsDestination()) {
  const skills = await listProjectSkills()
  await mkdir(destDir, { recursive: true })
  const installed = []
  for (const skill of skills) {
    const dest = join(destDir, skill.name)
    await rm(dest, { recursive: true, force: true })
    await cp(skill.source, dest, { recursive: true })
    installed.push({ name: skill.name, source: skill.source, dest })
  }
  return installed
}

async function main() {
  const destDir = skillsDestination()
  const installed = await installProjectSkills(destDir)
  for (const skill of installed) {
    const { name, dest } = skill
    console.log(`Installed ${name} to ${dest}`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
