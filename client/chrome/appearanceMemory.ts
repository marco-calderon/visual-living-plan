/** The last appearance saved in Settings, kept in this browser so an open or restored plan page can catch up. */
export const APPEARANCE_MEMORY_KEY = 'living-plan-appearance'

export type RememberedAppearance = {
  accent?: string
  pageWidth?: 'default' | 'wide' | 'full'
  diffsTheme?: string
  wrapCode?: boolean
  savedAt: number
}

export function readRememberedAppearance(): RememberedAppearance | null {
  try {
    const raw = localStorage.getItem(APPEARANCE_MEMORY_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as RememberedAppearance
    return typeof parsed?.savedAt === 'number' ? parsed : null
  } catch {
    return null
  }
}

export function rememberAppearance(patch: Omit<RememberedAppearance, 'savedAt'>): void {
  try {
    const next: RememberedAppearance = { ...readRememberedAppearance(), ...patch, savedAt: Date.now() }
    localStorage.setItem(APPEARANCE_MEMORY_KEY, JSON.stringify(next))
  } catch {
    // Storage can be blocked. The next page load still reads the saved settings from the server.
  }
}
