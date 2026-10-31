import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planIdFromPath, tanstackPage } from '../start/src/delegate.ts'

test('TanStack Start renders the plan page, sign-in, the sample, and the no-account page', () => {
  assert.equal(tanstackPage('/plans/rate-limit-sample/', 'GET'), 'plan')
  assert.equal(tanstackPage('/plans/rate-limit-sample', 'GET'), 'plan')
  assert.equal(planIdFromPath('/plans/rate-limit-sample/'), 'rate-limit-sample')
  assert.equal(tanstackPage('/login', 'GET'), 'app')
  assert.equal(tanstackPage('/local/', 'GET'), 'app')
  assert.equal(tanstackPage('/sample', 'HEAD'), 'app')
})

test('the Worker keeps the session, the dashboard, and plan writes', () => {
  assert.equal(tanstackPage('/plans/rate-limit-sample/api/events', 'GET'), null)
  assert.equal(tanstackPage('/plans/rate-limit-sample/api/interactions/fail-mode', 'POST'), null)
  assert.equal(tanstackPage('/api/auth/sign-in/email', 'POST'), null)
  assert.equal(tanstackPage('/api/plans', 'POST'), null)
  assert.equal(tanstackPage('/dashboard', 'GET'), null)
  assert.equal(tanstackPage('/', 'GET'), null)
  assert.equal(tanstackPage('/plans/rate-limit-sample/view/abc', 'GET'), null)
  assert.equal(tanstackPage('/plans/rate-limit-sample/', 'POST'), null)
})
