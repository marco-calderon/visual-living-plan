/** Account appearance stored in D1. A loopback plan keeps its own theme file. */
export const PAGE_WIDTHS = ['default', 'wide', 'full'] as const
export type PageWidth = (typeof PAGE_WIDTHS)[number]

export const DIFFS_THEMES = ['pierre', 'soft', 'vibrant', 'protanopia-deuteranopia', 'tritanopia'] as const

export const ACCENT_CHOICES = [
  { label: 'Teal', accent: '#0f766e' },
  { label: 'Cyan', accent: '#0e7490' },
  { label: 'Sky', accent: '#0369a1' },
  { label: 'Blue', accent: '#1d4ed8' },
  { label: 'Violet', accent: '#6d28d9' },
  { label: 'Magenta', accent: '#a21caf' },
  { label: 'Rose', accent: '#be123c' },
  { label: 'Amber', accent: '#b45309' },
] as const

export type AccountSettings = {
  accent: string
  pageWidth: PageWidth
  diffsTheme: string
  wrapCode: boolean
}

export const USER_SETTINGS_SQL = `CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY,
  meta TEXT NOT NULL
)`

export function defaultAccountSettings(): AccountSettings {
  return { accent: '#0f766e', pageWidth: 'default', diffsTheme: 'pierre', wrapCode: false }
}

export function normalizeAccent(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  const short = value.match(/^#([0-9a-fA-F]{3})$/)
  if (short?.[1]) {
    const [r, g, b] = short[1]
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  const full = value.match(/^#([0-9a-fA-F]{6})$/)
  return full?.[1] ? `#${full[1].toLowerCase()}` : null
}

function isPageWidth(value: unknown): value is PageWidth {
  return typeof value === 'string' && (PAGE_WIDTHS as readonly string[]).includes(value)
}

function isDiffsTheme(value: unknown): value is string {
  return typeof value === 'string' && (DIFFS_THEMES as readonly string[]).includes(value)
}

function readWrap(value: unknown): boolean {
  return value === true || value === 1 || value === 'true' || value === '1' || value === 'on'
}

/** Keep the current account settings and apply only valid fields from a request. */
export function mergeAccountSettings(current: AccountSettings, patch: unknown): AccountSettings {
  if (!patch || typeof patch !== 'object') return current
  const record = patch as Record<string, unknown>
  return {
    accent: record.accent === undefined ? current.accent : (normalizeAccent(record.accent) ?? current.accent),
    pageWidth: record.pageWidth === undefined ? current.pageWidth : isPageWidth(record.pageWidth) ? record.pageWidth : current.pageWidth,
    diffsTheme: record.diffsTheme === undefined ? current.diffsTheme : isDiffsTheme(record.diffsTheme) ? record.diffsTheme : current.diffsTheme,
    wrapCode: record.wrapCode === undefined ? current.wrapCode : readWrap(record.wrapCode),
  }
}

type SettingsRow = { meta: string }

function settingsFromMeta(meta: string): AccountSettings {
  try {
    return mergeAccountSettings(defaultAccountSettings(), JSON.parse(meta) as unknown)
  } catch {
    return defaultAccountSettings()
  }
}

export async function ensureUserSettings(db: D1Database): Promise<void> {
  await db.prepare(USER_SETTINGS_SQL).run()
}

export async function readAccountSettings(db: D1Database, userId: string): Promise<AccountSettings> {
  await ensureUserSettings(db)
  const row = await db.prepare('SELECT meta FROM user_settings WHERE user_id = ?').bind(userId).first<SettingsRow>()
  if (!row?.meta) return defaultAccountSettings()
  return settingsFromMeta(row.meta)
}

export async function saveAccountSettings(db: D1Database, userId: string, patch: unknown): Promise<AccountSettings> {
  const next = mergeAccountSettings(await readAccountSettings(db, userId), patch)
  await db
    .prepare(
      `INSERT INTO user_settings (user_id, meta) VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET meta = excluded.meta`,
    )
    .bind(userId, JSON.stringify(next))
    .run()
  return next
}
