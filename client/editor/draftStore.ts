import type { DraftConflict, DraftSide } from '../../src/planMdx/rebaseDraft.ts'

/**
 * Changes to a plan that are not applied yet, kept on this device. It lives in localStorage, so
 * closing the tab or the browser keeps them, and nothing reaches the plan until the person applies
 * them (ADR 0040).
 */
export type PlanDraft = {
  /** The plan file the changes started from. Applying is refused when the plan moved on since. */
  base: string
  /** The plan file with the changes. */
  source: string
  /** How many block edits it holds, for the Apply bar. */
  edits: number
  savedAt: number
  /**
   * Set while some of the changes overlap what the agent wrote since (src/planMdx/rebaseDraft.ts).
   * `source` is then the agent's plan with the changes that did not overlap; the person's own
   * version stays here until they choose a side for each overlapping block.
   */
  rebase?: DraftRebase
}

export type DraftRebase = {
  /** The plan the changes started from, before the agent wrote. */
  base: string
  /** The plan with the changes, as the person left it. */
  mine: string
  /** Sides already chosen, by conflict key. */
  keep: Record<string, DraftSide>
  /** Blocks still to choose for. */
  conflicts: DraftConflict[]
}

/** A draft from the whole-page editor (before 2.26): the editor's text, not yet a plan file. */
export type LegacyPlanDraft = { base: string; markdown: string; savedAt: number }

const PREFIX = 'living-plan:draft:'

function key(planId: string): string {
  return `${PREFIX}${planId}`
}

export function readDraft(planId: string): PlanDraft | LegacyPlanDraft | null {
  try {
    const raw = window.localStorage.getItem(key(planId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PlanDraft & LegacyPlanDraft>
    if (typeof parsed.base !== 'string') return null
    const savedAt = typeof parsed.savedAt === 'number' ? parsed.savedAt : 0
    if (typeof parsed.source === 'string') {
      const edits = typeof parsed.edits === 'number' ? parsed.edits : 1
      if (parsed.rebase === undefined) return { base: parsed.base, source: parsed.source, edits, savedAt }
      const rebase = readRebase(parsed.rebase)
      if (rebase) return { base: parsed.base, source: parsed.source, edits, savedAt, rebase }
      // Overlaps this page cannot read: start again from the person's own version, so none of it is lost.
      const own = parsed.rebase as Partial<DraftRebase> | null
      if (own && typeof own.base === 'string' && typeof own.mine === 'string') return { base: own.base, source: own.mine, edits, savedAt }
      return { base: parsed.base, source: parsed.source, edits, savedAt }
    }
    if (typeof parsed.markdown === 'string') return { base: parsed.base, markdown: parsed.markdown, savedAt }
    return null
  } catch {
    return null
  }
}

function readRebase(value: unknown): DraftRebase | undefined {
  if (!value || typeof value !== 'object') return undefined
  const rebase = value as Partial<DraftRebase>
  if (typeof rebase.base !== 'string' || typeof rebase.mine !== 'string' || !Array.isArray(rebase.conflicts)) return undefined
  const keep: Record<string, DraftSide> = {}
  for (const [name, side] of Object.entries(rebase.keep && typeof rebase.keep === 'object' ? rebase.keep : {})) {
    if (side === 'mine' || side === 'theirs') keep[name] = side
  }
  const conflicts: DraftConflict[] = []
  for (const conflict of rebase.conflicts as unknown[]) {
    const entry = (conflict ?? {}) as Partial<DraftConflict>
    if (typeof entry.key !== 'string' || typeof entry.label !== 'string' || typeof entry.mine !== 'string' || typeof entry.theirs !== 'string') {
      return undefined
    }
    conflicts.push({
      key: entry.key,
      label: entry.label,
      ...(typeof entry.within === 'string' ? { within: entry.within } : {}),
      mine: entry.mine,
      theirs: entry.theirs,
      minePreview: typeof entry.minePreview === 'string' ? entry.minePreview : '',
    })
  }
  return conflicts.length > 0 ? { base: rebase.base, mine: rebase.mine, keep, conflicts } : undefined
}

export function isLegacyDraft(draft: PlanDraft | LegacyPlanDraft): draft is LegacyPlanDraft {
  return !('source' in draft)
}

/** False when the browser refused the write (private window, storage full). */
export function writeDraft(planId: string, draft: PlanDraft): boolean {
  try {
    window.localStorage.setItem(key(planId), JSON.stringify(draft))
    return true
  } catch {
    return false
  }
}

export function clearDraft(planId: string): void {
  try {
    window.localStorage.removeItem(key(planId))
  } catch {
    // Nothing to clear.
  }
}

/**
 * Run `save` at most once every `waitMs` while calls keep coming, and once more after the last
 * call, so the newest text is always written. `flush` writes a pending call now.
 */
export function throttle(save: () => void, waitMs: number): { call: () => void; flush: () => void; cancel: () => void } {
  let last = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending = false
  const run = () => {
    timer = undefined
    pending = false
    last = Date.now()
    save()
  }
  return {
    call() {
      pending = true
      if (timer) return
      const wait = Math.max(0, waitMs - (Date.now() - last))
      timer = setTimeout(run, wait)
    },
    flush() {
      if (!pending) return
      if (timer) clearTimeout(timer)
      run()
    },
    cancel() {
      if (timer) clearTimeout(timer)
      timer = undefined
      pending = false
    },
  }
}
