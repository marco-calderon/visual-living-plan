import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getTableColumns } from 'drizzle-orm'
import { migratePlanDatabase } from '../src/store/migrate.ts'
import { planEvents, planRuns, plans, planVersions, userSettings } from '../src/store/tables.ts'
import { openSqliteStore } from '../src/store/sqlite.ts'

function columnNames(db: ReturnType<typeof openSqliteStore>, table: string): string[] {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all<{ name: string }>()
    .map((column) => column.name)
    .sort()
}

function indexNames(db: ReturnType<typeof openSqliteStore>, table: string): string[] {
  return db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND name NOT LIKE 'sqlite_%'`)
    .bind(table)
    .all<{ name: string }>()
    .map((row) => row.name)
    .sort()
}

function names(table: Parameters<typeof getTableColumns>[0]): string[] {
  return Object.values(getTableColumns(table))
    .map((column) => column.name)
    .sort()
}

test('sqlite tables match the shared schema', () => {
  const db = openSqliteStore(':memory:')
  try {
    migratePlanDatabase(db)
    assert.deepEqual(columnNames(db, 'plans'), names(plans))
    assert.deepEqual(columnNames(db, 'plan_runs'), names(planRuns))
    assert.deepEqual(columnNames(db, 'plan_versions'), names(planVersions))
    assert.deepEqual(columnNames(db, 'plan_events'), names(planEvents))
    assert.deepEqual(columnNames(db, 'user_settings'), names(userSettings))
    assert.equal(columnNames(db, 'user').includes('email'), true)
    assert.equal(
      db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'plan_sessions'`).get(),
      null,
    )
    assert.deepEqual(indexNames(db, 'plan_events'), ['plan_events_plan_id_idx', 'plan_events_plan_seq_idx'])
    assert.ok(indexNames(db, 'plans').includes('plans_started_at_idx'))
    assert.ok(indexNames(db, 'plans').includes('plans_status_idx'))
    assert.deepEqual(indexNames(db, 'plan_runs'), ['plan_runs_ended_at_idx', 'plan_runs_started_at_idx'])
  } finally {
    db.close()
  }
})
