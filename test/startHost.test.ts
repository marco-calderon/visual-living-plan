import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planIdFromPath, tanstackPage } from '../src/pageRoutes.ts'

test('TanStack Start renders every page', () => {
  assert.equal(tanstackPage('/plans/rate-limit-sample/', 'GET'), 'plan')
  assert.equal(tanstackPage('/plans/rate-limit-sample', 'GET'), 'plan')
  assert.equal(planIdFromPath('/plans/rate-limit-sample/'), 'rate-limit-sample')
  assert.equal(tanstackPage('/login', 'GET'), 'app')
  assert.equal(tanstackPage('/local/', 'GET'), 'app')
  assert.equal(tanstackPage('/sample', 'HEAD'), 'app')
  assert.equal(tanstackPage('/', 'GET'), 'app')
  assert.equal(tanstackPage('/review/', 'GET'), 'app')
  assert.equal(tanstackPage('/dashboard', 'GET'), 'app')
  assert.equal(tanstackPage('/account/', 'GET'), 'app')
  assert.equal(tanstackPage('/settings', 'GET'), 'app')
  assert.equal(tanstackPage('/plans/rate-limit-sample/history', 'GET'), 'app')
  assert.equal(tanstackPage('/plans/rate-limit-sample/history/', 'HEAD'), 'app')
})

test('the Worker keeps the session, downloads, and plan writes', () => {
  assert.equal(tanstackPage('/plans/rate-limit-sample/api/events', 'GET'), null)
  assert.equal(tanstackPage('/plans/rate-limit-sample/api/interactions/fail-mode', 'POST'), null)
  assert.equal(tanstackPage('/api/auth/sign-in/email', 'POST'), null)
  assert.equal(tanstackPage('/api/plans', 'POST'), null)
  assert.equal(tanstackPage('/api/account', 'GET'), null)
  assert.equal(tanstackPage('/plans/rate-limit-sample/view/abc', 'GET'), null)
  assert.equal(tanstackPage('/plans/rate-limit-sample/document', 'GET'), null)
  assert.equal(tanstackPage('/plans/rate-limit-sample/versions/1', 'GET'), null)
  assert.equal(tanstackPage('/plans/rate-limit-sample/', 'POST'), null)
  assert.equal(tanstackPage('/dashboard', 'POST'), null)
})
