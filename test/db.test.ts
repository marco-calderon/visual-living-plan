import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { PLAN_COLUMNS, PLAN_RUN_COLUMNS, PLAN_SESSION_COLUMNS } from '../src/db/migrate.ts'
import { planRuns, planSessions, plans } from '../src/db/schema.ts'

function columnNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).columns.map((column) => column.name).sort()
}

test('drizzle tables match the migration column lists', () => {
  assert.deepEqual(columnNames(plans), PLAN_COLUMNS.map((column) => column.name).sort())
  assert.deepEqual(columnNames(planRuns), PLAN_RUN_COLUMNS.map((column) => column.name).sort())
  assert.deepEqual(columnNames(planSessions), PLAN_SESSION_COLUMNS.map((column) => column.name).sort())
  assert.deepEqual(
    getTableConfig(plans).indexes.map((entry) => entry.config.name).sort(),
    ['plans_started_at_idx', 'plans_status_idx'],
  )
  assert.deepEqual(
    getTableConfig(planRuns).indexes.map((entry) => entry.config.name).sort(),
    ['plan_runs_ended_at_idx', 'plan_runs_started_at_idx'],
  )
})
