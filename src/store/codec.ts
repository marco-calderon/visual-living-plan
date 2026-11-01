import type { Field } from './schema'
import type { SqliteStore } from './sqlite'

export function encodeFields(fields: readonly Field[], row: Record<string, unknown>): unknown[] {
  return fields.map((field) => {
    const value = row[field.key]
    if (field.kind === 'boolean') return value ? 1 : 0
    if (field.kind === 'json') return JSON.stringify(value ?? [])
    return value ?? null
  })
}

export function decodeRow<T>(fields: readonly Field[], raw: Record<string, unknown>): T {
  const row: Record<string, unknown> = {}
  for (const field of fields) {
    const value = raw[field.name]
    if (field.kind === 'boolean') {
      row[field.key] = value === 1 || value === true
      continue
    }
    if (field.kind === 'json') {
      if (typeof value === 'string') {
        try {
          row[field.key] = JSON.parse(value)
        } catch {
          row[field.key] = []
        }
      } else if (Array.isArray(value)) {
        row[field.key] = value
      } else {
        row[field.key] = []
      }
      continue
    }
    if (field.kind === 'integer') {
      row[field.key] = value == null ? null : Number(value)
      continue
    }
    row[field.key] = value == null ? null : value
  }
  return row as T
}

export function upsert(
  db: SqliteStore,
  table: string,
  fields: readonly Field[],
  row: object,
  conflict: string,
  skip: readonly string[],
): void {
  const names = fields.map((field) => field.name)
  const assignments = fields
    .filter((field) => field.name !== conflict && !skip.includes(field.name))
    .map((field) => `${field.name} = excluded.${field.name}`)
  db.prepare(
    `INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')}) ON CONFLICT(${conflict}) DO UPDATE SET ${assignments.join(', ')}`,
  )
    .bind(...encodeFields(fields, row as Record<string, unknown>))
    .run()
}

export function insert(db: SqliteStore, table: string, fields: readonly Field[], row: object): void {
  const names = fields.map((field) => field.name)
  db.prepare(`INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`)
    .bind(...encodeFields(fields, row as Record<string, unknown>))
    .run()
}

export function selectRows<T>(db: SqliteStore, fields: readonly Field[], sql: string, values: unknown[] = []): T[] {
  return db
    .prepare(sql)
    .bind(...values)
    .all<Record<string, unknown>>()
    .map((raw) => decodeRow<T>(fields, raw))
}

export function selectRow<T>(db: SqliteStore, fields: readonly Field[], sql: string, values: unknown[] = []): T | undefined {
  const raw = db.prepare(sql).bind(...values).get<Record<string, unknown>>()
  return raw ? decodeRow<T>(fields, raw) : undefined
}
