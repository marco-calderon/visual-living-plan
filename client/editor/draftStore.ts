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
      return { base: parsed.base, source: parsed.source, edits: typeof parsed.edits === 'number' ? parsed.edits : 1, savedAt }
    }
    if (typeof parsed.markdown === 'string') return { base: parsed.base, markdown: parsed.markdown, savedAt }
    return null
  } catch {
    return null
  }
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
