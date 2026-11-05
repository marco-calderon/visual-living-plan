import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createIdleExecutionState } from '../src/execution.ts'
import {
  accountLinkingConfig,
  linkAccountErrorMessage,
  linkSocialRequest,
  providerIsLinked,
} from '../src/accountLinking.ts'
import { listLinkedAccounts } from '../src/host/linkedAccounts.ts'
import { createAuth, type AuthEnv } from '../src/host/auth.ts'
import { parsePlan } from '../src/parse.ts'
import { renderPlanPage } from '../src/render.ts'
import { defaultThemeConfig, themePayload } from '../src/theme.ts'

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

test('linking keeps a provider only when its email matches the signed-in account', () => {
  const off = accountLinkingConfig({ github: false, google: false })
  assert.equal(off.enabled, true)
  assert.equal(off.allowDifferentEmails, false)
  assert.equal(off.updateUserInfoOnLink, false)
  assert.deepEqual(off.trustedProviders, [])

  const both = accountLinkingConfig({ github: true, google: true })
  assert.deepEqual(both.trustedProviders, ['github', 'google'])
  assert.equal(both.allowDifferentEmails, false)

  const auth = createAuth(env({ github: true, google: true }), origin)
  assert.equal(auth.options.account?.accountLinking?.allowDifferentEmails, false)
  assert.equal(auth.options.account?.accountLinking?.enabled, true)
  assert.deepEqual(auth.options.account?.accountLinking?.trustedProviders, ['github', 'google'])
  void auth.$context.catch(() => undefined)

  const githubOnly = createAuth(env({ github: true }), origin)
  assert.deepEqual(githubOnly.options.account?.accountLinking?.trustedProviders, ['github'])
  assert.equal(githubOnly.options.account?.accountLinking?.allowDifferentEmails, false)
  void githubOnly.$context.catch(() => undefined)
})

test('a linked provider stays disabled and a mismatch explains why', () => {
  const accounts = [{ providerId: 'credential' }, { providerId: 'github' }]
  assert.equal(providerIsLinked(accounts, 'github'), true)
  assert.equal(providerIsLinked(accounts, 'google'), false)
  assert.deepEqual(linkSocialRequest('google', 'ada@example.com'), {
    provider: 'google',
    callbackURL: '/settings',
    errorCallbackURL: '/settings',
    loginHint: 'ada@example.com',
  })
  assert.match(linkAccountErrorMessage('email_does_not_match'), /does not match/)
  assert.match(linkAccountErrorMessage('email_not_found'), /does not match/)
  assert.match(linkAccountErrorMessage('account_already_linked_to_different_user'), /someone else/)
  assert.match(linkAccountErrorMessage('unable_to_link_account'), /Could not link/)
  assert.equal(linkAccountErrorMessage(undefined), '')
})

test('linked provider ids come from this user and ignore duplicates', async () => {
  const calls: string[] = []
  const db = {
    prepare(sql: string) {
      calls.push(sql)
      return {
        bind(userId: string) {
          assert.equal(userId, 'user-1')
          return {
            async all() {
              return { results: [{ providerId: 'github' }, { providerId: 'github' }, { providerId: '' }, { providerId: 'google' }] }
            },
          }
        },
      }
    },
  } as unknown as D1Database
  assert.deepEqual(await listLinkedAccounts(db, 'user-1'), [{ providerId: 'github' }, { providerId: 'google' }])
  assert.match(calls[0] ?? '', /FROM account WHERE userId = \?/)

  const empty = {
    prepare() {
      return { bind: () => ({ all: async () => ({}) }) }
    },
  } as unknown as D1Database
  assert.deepEqual(await listLinkedAccounts(empty, 'user-2'), [])
})

test('hosted settings link GitHub and Google, and a loopback plan does not', () => {
  const settings = readFileSync(new URL('../src/settings/SettingsDialog.tsx', import.meta.url), 'utf8')
  const section = readFileSync(new URL('../src/LinkSocialAccounts.tsx', import.meta.url), 'utf8')
  assert.match(settings, /LinkSocialAccounts/)
  assert.match(section, /authClient\.linkSocial/)
  assert.match(section, /data-link-accounts/)
  assert.match(section, /data-host-panel="cloud"/)
  assert.match(section, /Link \$\{name\}/)
  assert.match(section, /disabled=\{linked \|\| pending !== null\}/)

  const plan = parsePlan(
    `---
title: Loopback plan
---

# Scope

Stay on this machine.
`,
    'loopback.plan.md',
  )
  const html = renderPlanPage({
    plan,
    mode: 'watch',
    responses: {},
    diffs: [],
    iteration: 1,
    pendingInteractionIds: [],
    execution: createIdleExecutionState(),
    clientAssets: null,
    theme: themePayload(defaultThemeConfig(), 'live-plan.config.json'),
  })
  assert.match(html, /data-host-panel="local"/)
  assert.doesNotMatch(html, /data-link-accounts/)
  assert.doesNotMatch(html, /Link GitHub/)
  assert.doesNotMatch(html, /Link Google/)
  assert.doesNotMatch(html, /linkSocial/)
})
