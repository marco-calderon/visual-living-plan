import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export type SqliteStatement = {
  bind(...values: unknown[]): SqliteStatement
  get<T>(...values: unknown[]): T | null
  all<T>(...values: unknown[]): T[]
  run(...values: unknown[]): { changes: number }
}

/** One SQLite file. Local plans use this. The hosted catalog uses D1 with the same tables. */
export type SqliteStore = {
  database: Database
  exec(sql: string): void
  prepare(sql: string): SqliteStatement
  transaction<T>(run: () => T): T
  close(): void
}

function bindValue(value: unknown): string | number | bigint | null | Uint8Array {
  if (value === undefined || value === null) return null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'string') return value
  if (value instanceof Uint8Array) return value
  return JSON.stringify(value)
}

/** Open the local database. `:memory:` is a private database and skips the WAL pragma. */
export function openSqliteStore(path: string): SqliteStore {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new Database(path, { strict: true })
  db.exec('PRAGMA busy_timeout = 3000')
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL')

  return {
    database: db,
    exec(sql) {
      db.exec(sql)
    },
    prepare(sql) {
      const statement = db.query(sql)
      const wrap = (values: unknown[]): SqliteStatement => ({
        bind(...next) {
          return wrap(next)
        },
        get<T>(...next: unknown[]) {
          const used = next.length > 0 ? next : values
          return (statement.get(...(used.map(bindValue) as never[])) as T | null) ?? null
        },
        all<T>(...next: unknown[]) {
          const used = next.length > 0 ? next : values
          return statement.all(...(used.map(bindValue) as never[])) as T[]
        },
        run(...next: unknown[]) {
          const used = next.length > 0 ? next : values
          statement.run(...(used.map(bindValue) as never[]))
          return { changes: 0 }
        },
      })
      return wrap([])
    },
    transaction(run) {
      return db.transaction(run)()
    },
    close() {
      db.close()
    },
  }
}
