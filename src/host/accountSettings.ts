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
  accent TEXT NOT NULL,
  page_width TEXT NOT NULL,
  diffs_theme TEXT NOT NULL,
  wrap_code INTEGER NOT NULL,
  updated_at TEXT NOT NULL
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

type SettingsRow = { accent: string; page_width: string; diffs_theme: string; wrap_code: number | boolean }

export async function ensureUserSettings(db: D1Database): Promise<void> {
  await db.prepare(USER_SETTINGS_SQL).run()
}

export async function readAccountSettings(db: D1Database, userId: string): Promise<AccountSettings> {
  await ensureUserSettings(db)
  const row = await db
    .prepare('SELECT accent, page_width, diffs_theme, wrap_code FROM user_settings WHERE user_id = ?')
    .bind(userId)
    .first<SettingsRow>()
  if (!row) return defaultAccountSettings()
  return mergeAccountSettings(defaultAccountSettings(), {
    accent: row.accent,
    pageWidth: row.page_width,
    diffsTheme: row.diffs_theme,
    wrapCode: row.wrap_code,
  })
}

export async function saveAccountSettings(db: D1Database, userId: string, patch: unknown): Promise<AccountSettings> {
  const next = mergeAccountSettings(await readAccountSettings(db, userId), patch)
  await db
    .prepare(
      `INSERT INTO user_settings (user_id, accent, page_width, diffs_theme, wrap_code, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         accent = excluded.accent,
         page_width = excluded.page_width,
         diffs_theme = excluded.diffs_theme,
         wrap_code = excluded.wrap_code,
         updated_at = excluded.updated_at`,
    )
    .bind(userId, next.accent, next.pageWidth, next.diffsTheme, next.wrapCode ? 1 : 0, new Date().toISOString())
    .run()
  return next
}
