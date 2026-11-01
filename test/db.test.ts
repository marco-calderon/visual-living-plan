import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PLAN_COLUMNS, PLAN_EVENT_COLUMNS, PLAN_RUN_COLUMNS, PLAN_SESSION_COLUMNS, migratePlanDatabase } from '../src/store/migrate.ts'
import { EVENT_FIELDS, PLAN_FIELDS, RUN_FIELDS, SESSION_FIELDS } from '../src/store/schema.ts'
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

test('sqlite tables match the migration column lists', () => {
  const db = openSqliteStore(':memory:')
  try {
    migratePlanDatabase(db)
    assert.deepEqual(columnNames(db, 'plans'), PLAN_COLUMNS.map((column) => column.name).sort())
    assert.deepEqual(columnNames(db, 'plan_runs'), PLAN_RUN_COLUMNS.map((column) => column.name).sort())
    assert.deepEqual(columnNames(db, 'plan_sessions'), PLAN_SESSION_COLUMNS.map((column) => column.name).sort())
    assert.deepEqual(columnNames(db, 'plan_events'), PLAN_EVENT_COLUMNS.map((column) => column.name).sort())
    assert.deepEqual(PLAN_FIELDS.map((field) => field.name), PLAN_COLUMNS.map((column) => column.name))
    assert.deepEqual(RUN_FIELDS.map((field) => field.name), PLAN_RUN_COLUMNS.map((column) => column.name))
    assert.deepEqual(SESSION_FIELDS.map((field) => field.name), PLAN_SESSION_COLUMNS.map((column) => column.name))
    assert.deepEqual(EVENT_FIELDS.map((field) => field.name), PLAN_EVENT_COLUMNS.map((column) => column.name))
    assert.deepEqual(indexNames(db, 'plan_events'), ['plan_events_plan_id_idx', 'plan_events_plan_seq_idx'])
    assert.deepEqual(indexNames(db, 'plans'), ['plans_started_at_idx', 'plans_status_idx'])
    assert.deepEqual(indexNames(db, 'plan_runs'), ['plan_runs_ended_at_idx', 'plan_runs_started_at_idx'])
  } finally {
    db.close()
  }
})
