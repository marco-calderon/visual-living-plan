import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { sql } from 'drizzle-orm'
import { migratePlanDatabase } from './migrate.js'
import * as schema from './schema.js'

export type PlanDatabase = BunSQLiteDatabase<typeof schema>

export function openPlanDatabase(dbPath: string): { db: PlanDatabase; close: () => void } {
  const db = drizzle({
    connection: { source: dbPath, create: true },
    schema,
  })
  if (dbPath !== ':memory:') {
    db.run(sql.raw('PRAGMA journal_mode = WAL'))
  }
  db.run(sql.raw('PRAGMA busy_timeout = 3000'))
  migratePlanDatabase(db)
  return {
    db,
    close() {
      db.$client.close()
    },
  }
}
