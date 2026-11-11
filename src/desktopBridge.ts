/**
 * What a page knows when it runs inside the desktop app ([ADR 0038]).
 *
 * The app sets `window.__LIVING_PLAN_DESKTOP__` and `data-desktop` on the root before the page's
 * scripts run (`desktop/bridge.js`). The page gets no Tauri API. It reaches the app by following
 * `living-plan://` links, and the app hands it one thing: the look chosen in setup, which a hosted
 * page saves to the signed-in account once.
 *
 * [ADR 0038]: ../docs/architecture/decisions/0038-desktop-setup-and-cloud.md
 */
import { applyAppearance } from './appearanceDom'

export type DesktopAppearance = { accent: string; diffsTheme: string; savedAt: number }

export type DesktopInfo = {
  platform: string
  /** `overlay` when the page's toolbar is the window's title bar. */
  chrome: string
  appearance?: DesktopAppearance
}

export const DESKTOP_APPEARANCE_EVENT = 'living-plan-desktop-appearance'

/** Where this origin keeps the `savedAt` of the setup look it last saved to the account. */
const APPLIED_KEY = 'living-plan-desktop-appearance'

type DesktopWindow = Window & { __LIVING_PLAN_DESKTOP__?: DesktopInfo }

export function desktopInfo(): DesktopInfo | null {
  if (typeof window === 'undefined') return null
  const info = (window as DesktopWindow).__LIVING_PLAN_DESKTOP__
  return info && typeof info === 'object' ? info : null
}

function readAppearance(value: unknown): DesktopAppearance | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.accent !== 'string' || typeof record.diffsTheme !== 'string') return null
  const savedAt = typeof record.savedAt === 'number' && Number.isFinite(record.savedAt) ? record.savedAt : 0
  return savedAt > 0 ? { accent: record.accent, diffsTheme: record.diffsTheme, savedAt } : null
}

/** The setup look this origin has not saved yet, or null. */
export function pendingDesktopAppearance(info: DesktopInfo | null, appliedAt: number): DesktopAppearance | null {
  const appearance = readAppearance(info?.appearance)
  return appearance && appearance.savedAt > appliedAt ? appearance : null
}

function appliedAt(): number {
  try {
    return Number(localStorage.getItem(APPLIED_KEY)) || 0
  } catch {
    return 0
  }
}

/**
 * Save the look chosen in the app's setup to the signed-in account, once per choice. The save
 * carries the time of the choice, so the host keeps an account look that was changed after it.
 * A signed-out page saves nothing and tries again on the next page.
 */
export async function saveDesktopAppearance(settingsUrl: string, followsAccount: () => boolean): Promise<void> {
  const appearance = pendingDesktopAppearance(desktopInfo(), appliedAt())
  if (!appearance) return
  const response = await fetch(settingsUrl, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accent: appearance.accent, diffsTheme: appearance.diffsTheme, updatedAt: appearance.savedAt }),
  }).catch(() => null)
  if (!response?.ok) return
  try {
    localStorage.setItem(APPLIED_KEY, String(appearance.savedAt))
  } catch {
    // Without storage the same look is saved again on the next page, which changes nothing.
  }
  const saved = (await response.json().catch(() => null)) as { settings?: Record<string, unknown> } | Record<string, unknown> | null
  const settings = (saved && typeof saved === 'object' && 'settings' in saved ? saved.settings : saved) as Record<string, unknown> | null
  // The host answers with the look it kept. Show it when this page follows the account.
  if (!settings || typeof settings.accent !== 'string' || typeof settings.diffsTheme !== 'string' || !followsAccount()) return
  const root = document.documentElement
  applyAppearance(
    {
      accent: settings.accent,
      diffsTheme: settings.diffsTheme,
      pageWidth: typeof settings.pageWidth === 'string' ? settings.pageWidth : (root.dataset.layout ?? 'default'),
      wrapCode: typeof settings.wrapCode === 'boolean' ? settings.wrapCode : root.dataset.wrapCode === 'true',
    },
    { notify: true },
  )
}
