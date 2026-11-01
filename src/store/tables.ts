import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { PlanMeta, SettingsMeta } from './meta'

/**
 * One SQLite shape for the local registry file and for D1.
 * Better Auth tables are created in both. The library runs only on the host.
 * A local plan leaves `user_id` null.
 */
export const plans = sqliteTable(
  'plans',
  {
    id: text('id').primaryKey(),
    userId: text('user_id'),
    token: text('token'),
    title: text('title').notNull().default(''),
    mode: text('mode').notNull(),
    status: text('status').notNull(),
    planPath: text('plan_path'),
    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at'),
    heartbeatAt: integer('heartbeat_at').notNull(),
    meta: text('meta', { mode: 'json' }).$type<PlanMeta>().notNull(),
  },
  (table) => [
    index('plans_plan_path_idx').on(table.planPath),
    index('plans_started_at_idx').on(table.startedAt),
    index('plans_status_idx').on(table.status),
    index('plans_user_idx').on(table.userId),
  ],
)

/** Finished-run history. Same columns as `plans`, with `run_id` as the primary key. */
export const planRuns = sqliteTable(
  'plan_runs',
  {
    runId: text('run_id').primaryKey(),
    id: text('id').notNull(),
    userId: text('user_id'),
    token: text('token'),
    title: text('title').notNull().default(''),
    mode: text('mode').notNull(),
    status: text('status').notNull(),
    planPath: text('plan_path'),
    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at'),
    heartbeatAt: integer('heartbeat_at').notNull(),
    meta: text('meta', { mode: 'json' }).$type<PlanMeta>().notNull(),
  },
  (table) => [index('plan_runs_started_at_idx').on(table.startedAt), index('plan_runs_ended_at_idx').on(table.endedAt)],
)

/** Document history. Local keeps the chain. The host keeps the latest 10. */
export const planVersions = sqliteTable(
  'plan_versions',
  {
    id: text('id').primaryKey(),
    planId: text('plan_id').notNull(),
    seq: integer('seq').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    createdAt: integer('created_at').notNull(),
    parentId: text('parent_id'),
    reason: text('reason'),
    restoredFromId: text('restored_from_id'),
  },
  (table) => [
    uniqueIndex('plan_versions_plan_seq').on(table.planId, table.seq),
    index('plan_versions_plan').on(table.planId, table.seq),
  ],
)

export const planEvents = sqliteTable(
  'plan_events',
  {
    id: text('id').primaryKey(),
    planId: text('plan_id').notNull(),
    seq: integer('seq').notNull(),
    event: text('event').notNull(),
    data: text('data').notNull(),
    createdAt: integer('created_at').notNull(),
    deliveredAt: integer('delivered_at'),
  },
  (table) => [index('plan_events_plan_id_idx').on(table.planId), index('plan_events_plan_seq_idx').on(table.planId, table.seq)],
)

export const userSettings = sqliteTable('user_settings', {
  userId: text('user_id').primaryKey(),
  meta: text('meta', { mode: 'json' }).$type<SettingsMeta>().notNull(),
})

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('emailVerified').notNull().default(0),
  image: text('image'),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt').notNull(),
  tier: text('tier').notNull().default('free'),
})

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  expiresAt: text('expiresAt').notNull(),
  token: text('token').notNull().unique(),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt').notNull(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId').notNull(),
  activeOrganizationId: text('activeOrganizationId'),
})

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId').notNull(),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: text('accessTokenExpiresAt'),
  refreshTokenExpiresAt: text('refreshTokenExpiresAt'),
  scope: text('scope'),
  password: text('password'),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt').notNull(),
})

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: text('expiresAt').notNull(),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt').notNull(),
})

export const organization = sqliteTable('organization', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logo: text('logo'),
  createdAt: text('createdAt').notNull(),
  metadata: text('metadata'),
})

export const member = sqliteTable('member', {
  id: text('id').primaryKey(),
  organizationId: text('organizationId').notNull(),
  userId: text('userId').notNull(),
  role: text('role').notNull(),
  createdAt: text('createdAt').notNull(),
})

export const invitation = sqliteTable('invitation', {
  id: text('id').primaryKey(),
  organizationId: text('organizationId').notNull(),
  email: text('email').notNull(),
  role: text('role'),
  status: text('status').notNull(),
  expiresAt: text('expiresAt').notNull(),
  createdAt: text('createdAt').notNull(),
  inviterId: text('inviterId').notNull(),
})
