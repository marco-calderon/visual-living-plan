import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getBaseURL } from 'better-auth'
import { createAuth, type AuthEnv } from '../src/host/auth.ts'

const origin = 'https://plan.logspace.qzz.io'

function env(github: boolean): AuthEnv {
  return {
    DB: {} as D1Database,
    BETTER_AUTH_SECRET: 'local-dev-secret-at-least-32-characters',
    ...(github
      ? { GITHUB_CLIENT_ID: 'github-client-id', GITHUB_CLIENT_SECRET: 'github-client-secret' }
      : {}),
  }
}

test('GitHub OAuth reads the Worker secrets and uses this host callback', () => {
  const off = createAuth(env(false), origin)
  assert.equal(off.options.socialProviders?.github, undefined)
  void off.$context.catch(() => undefined)

  const on = createAuth(env(true), origin)
  assert.equal(on.options.socialProviders?.github?.clientId, 'github-client-id')
  assert.equal(on.options.socialProviders?.github?.clientSecret, 'github-client-secret')
  assert.equal(on.options.baseURL, origin)
  assert.equal(getBaseURL(origin, '/api/auth') + '/callback/github', `${origin}/api/auth/callback/github`)
  void on.$context.catch(() => undefined)
})
