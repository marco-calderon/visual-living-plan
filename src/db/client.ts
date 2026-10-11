import { Database } from 'bun:sqlite'
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { migratePlanDatabase } from './migrate.js'
import * as schema from './schema.js'

export type PlanDatabase = BunSQLiteDatabase<typeof schema>

export function openPlanDatabase(dbPath: string): { sqlite: Database; db: PlanDatabase } {
  const sqlite = new Database(dbPath, { create: true })
  if (dbPath !== ':memory:') {
    sqlite.exec('PRAGMA journal_mode = WAL')
  }
  sqlite.exec('PRAGMA busy_timeout = 3000')
  migratePlanDatabase(sqlite)
  return { sqlite, db: drizzle(sqlite, { schema }) }
}
