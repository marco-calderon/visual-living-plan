import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getBaseURL } from 'better-auth'
import { createAuth, type AuthEnv } from '../src/host/auth.ts'

const origin = 'https://plan.logspace.qzz.io'

function env(providers: { github?: boolean; google?: boolean } = {}): AuthEnv {
  return {
    DB: {} as D1Database,
    BETTER_AUTH_SECRET: 'local-dev-secret-at-least-32-characters',
    ...(providers.github
      ? { GITHUB_CLIENT_ID: 'github-client-id', GITHUB_CLIENT_SECRET: 'github-client-secret' }
      : {}),
    ...(providers.google
      ? { GOOGLE_CLIENT_ID: 'google-client-id', GOOGLE_CLIENT_SECRET: 'google-client-secret' }
      : {}),
  }
}

test('GitHub and Google OAuth read the Worker secrets and use this host callback', () => {
  const off = createAuth(env(), origin)
  assert.equal(off.options.socialProviders?.github, undefined)
  assert.equal(off.options.socialProviders?.google, undefined)
  void off.$context.catch(() => undefined)

  const github = createAuth(env({ github: true }), origin)
  assert.equal(github.options.socialProviders?.github?.clientId, 'github-client-id')
  assert.equal(github.options.socialProviders?.github?.clientSecret, 'github-client-secret')
  assert.equal(github.options.socialProviders?.google, undefined)
  assert.equal(getBaseURL(origin, '/api/auth') + '/callback/github', `${origin}/api/auth/callback/github`)
  void github.$context.catch(() => undefined)

  const google = createAuth(env({ google: true }), origin)
  assert.equal(google.options.socialProviders?.google?.clientId, 'google-client-id')
  assert.equal(google.options.socialProviders?.google?.clientSecret, 'google-client-secret')
  assert.equal(google.options.socialProviders?.github, undefined)
  assert.equal(google.options.baseURL, origin)
  assert.equal(getBaseURL(origin, '/api/auth') + '/callback/google', `${origin}/api/auth/callback/google`)
  void google.$context.catch(() => undefined)
})
