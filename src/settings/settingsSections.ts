export const SETTINGS_SECTIONS = [
  {
    id: 'general',
    group: 'Preferences',
    label: 'General',
    keywords: 'appearance accent color theme page width code wrap pierre diff syntax',
  },
  {
    id: 'account',
    group: 'Preferences',
    label: 'Account',
    keywords: 'email name tier signed in linked github google provider login cli',
  },
  {
    id: 'usage',
    group: 'Preferences',
    label: 'Usage',
    keywords: 'storage space bytes plans versions limit quota',
  },
  {
    id: 'about',
    group: 'Host',
    label: 'About',
    keywords: 'version changelog release',
  },
] as const

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]['id']
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

const IDS = new Set<string>(SETTINGS_SECTIONS.map((section) => section.id))

/** The `settings` search value names an open section. Anything else keeps the modal closed. */
export function settingsSectionId(value: unknown): SettingsSectionId | undefined {
  return typeof value === 'string' && IDS.has(value) ? (value as SettingsSectionId) : undefined
}

/** Better Auth error codes are lowercase words. */
export function settingsErrorCode(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-z0-9_]+$/.test(value) ? value : undefined
}

export type RootSearch = { settings?: SettingsSectionId; settingsError?: string }

export function rootSearch(search: Record<string, unknown>): RootSearch {
  const settings = settingsSectionId(search.settings)
  if (!settings) return {}
  const settingsError = settingsErrorCode(search.settingsError)
  return settingsError ? { settings, settingsError } : { settings }
}

/** Sections whose label or keywords contain every word of the query. */
export function filterSections(query: string): SettingsSection[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return [...SETTINGS_SECTIONS]
  return SETTINGS_SECTIONS.filter((section) => {
    const text = `${section.label} ${section.keywords}`.toLowerCase()
    return words.every((word) => text.includes(word))
  })
}

export function groupSections(sections: readonly SettingsSection[]): Array<{ group: string; sections: SettingsSection[] }> {
  const groups: Array<{ group: string; sections: SettingsSection[] }> = []
  for (const section of sections) {
    const last = groups.at(-1)
    if (last?.group === section.group) last.sections.push(section)
    else groups.push({ group: section.group, sections: [section] })
  }
  return groups
}

const UNITS = ['B', 'KB', 'MB', 'GB'] as const

/** 1024-based, one decimal under 10. */
export function formatBytes(bytes: number): string {
  let value = Math.max(0, bytes)
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  if (unit === 0) return `${Math.round(value)} B`
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${UNITS[unit]}`
}

export const OPEN_SETTINGS_EVENT = 'living-plan-open-settings'

export type SettingsWindow = Window & { __LIVE_PLAN_SETTINGS_LAYER__?: boolean }

/** For chrome mounted outside the router, such as the account menu. False when no settings layer is on the page. */
export function openSettings(section: SettingsSectionId = 'general'): boolean {
  if (!(window as SettingsWindow).__LIVE_PLAN_SETTINGS_LAYER__) return false
  window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT, { detail: { section } }))
  return true
}
