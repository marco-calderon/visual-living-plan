import { test } from 'bun:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { planNotReadyReason } from '../src/planReady'

const plan = readFileSync(new URL('../examples/rate-limit.plan.md', import.meta.url), 'utf8')

test('a plan that compiles is ready', async () => {
  assert.equal(await planNotReadyReason(plan), undefined)
})

test('an empty or half-written plan is held back', async () => {
  assert.match(String(await planNotReadyReason('  \n')), /empty/)
  const reason = await planNotReadyReason(`${plan}\n\n<phase id="x" title="Half" status="active">\nNo closing tag\n`)
  assert.match(String(reason), /closing tag/)
})
