import { betterAuth } from 'better-auth'
import { bearer } from 'better-auth/plugins/bearer'
import { organization } from 'better-auth/plugins/organization'
import type { Tier } from './access'

export type AuthEnv = {
  DB: D1Database
  BETTER_AUTH_SECRET: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
}

/** D1 rejects Date and boolean bindings. Better Auth sends both. */
export function bindableD1(db: D1Database): D1Database {
  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === 'prepare') {
        return (sql: string) => {
          const statement = target.prepare(sql)
          return new Proxy(statement, {
            get(statementTarget, statementProp, statementReceiver) {
              if (statementProp === 'bind') {
                return (...values: unknown[]) => statementTarget.bind(...values.map(bindValue))
              }
              const value = Reflect.get(statementTarget, statementProp, statementReceiver)
              return typeof value === 'function' ? value.bind(statementTarget) : value
            },
          })
        }
      }
      const value = Reflect.get(target, prop, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

function bindValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'boolean') return value ? 1 : 0
  return value
}

export function createAuth(env: AuthEnv, baseURL: string) {
  return betterAuth({
    database: bindableD1(env.DB),
    secret: env.BETTER_AUTH_SECRET,
    baseURL,
    trustedOrigins: [baseURL],
    emailAndPassword: { enabled: true },
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ['github', 'google'],
      },
    },
    socialProviders: {
      ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
        : {}),
      ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
        ? { github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET } }
        : {}),
    },
    user: {
      additionalFields: {
        tier: { type: 'string', defaultValue: 'free', input: false },
      },
    },
    plugins: [bearer(), organization()],
    rateLimit: { enabled: false },
  })
}

export type AuthSession = {
  user: { id: string; email: string; name?: string; tier?: Tier | string }
  session: { token: string }
}

type SessionTokenRow = {
  token: string
  id: string
  email: string
  name: string
  tier: string | null
  expiresAt: string
}

function sessionStillValid(expiresAt: string): boolean {
  const numeric = Number(expiresAt)
  const ms = Number.isFinite(numeric) && numeric > 1e11 ? numeric : Date.parse(expiresAt)
  return Number.isFinite(ms) && ms > Date.now()
}

/**
 * The CLI stores the raw session token from sign-in. Better Auth's bearer
 * plugin does not turn that token back into a session, so `getSession` only
 * sees a browser cookie. Look the token up directly.
 */
export async function sessionFromToken(db: D1Database, token: string): Promise<AuthSession | null> {
  if (!token) return null
  const row = await db
    .prepare(
      `SELECT session.token AS token, user.id AS id, user.email AS email, user.name AS name, user.tier AS tier, session.expiresAt AS expiresAt
       FROM session JOIN user ON user.id = session.userId
       WHERE session.token = ?`,
    )
    .bind(token)
    .first<SessionTokenRow>()
  if (!row?.id || !row.email || !sessionStillValid(String(row.expiresAt ?? ''))) return null
  return {
    user: { id: row.id, email: row.email, name: row.name, tier: row.tier ?? 'free' },
    session: { token: row.token },
  }
}
