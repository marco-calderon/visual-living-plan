import { copyFile, mkdir } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'

const ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/

export function archivedPlanPath(plansDir: string, id: string): string | null {
  if (!ID_PATTERN.test(id)) return null
  return resolve(plansDir, `${id}.plan.md`)
}

export function isPathInside(parent: string, child: string): boolean {
  const root = resolve(parent)
  const target = resolve(child)
  const rel = relative(root, target)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

/** Copy the plan markdown into the registry home so it outlives the working tree. */
export async function archivePlanFile(plansDir: string, id: string, planPath: string): Promise<string | null> {
  const target = archivedPlanPath(plansDir, id)
  if (!target) return null
  try {
    await mkdir(plansDir, { recursive: true })
    await copyFile(planPath, target)
    return target
  } catch {
    return null
  }
}
