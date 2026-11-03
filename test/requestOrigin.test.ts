import assert from 'node:assert/strict'
import { test } from 'node:test'
import { originMatches, parseTrustedOrigins, requestOrigin } from '../src/host/requestOrigin.ts'

const pattern = 'https://*-visual-living-plan.mcalderon-code.workers.dev'
const preview = 'https://alias-visual-living-plan.mcalderon-code.workers.dev'
const production = 'https://plan.logspace.qzz.io'

test('a matching preview origin wins over PUBLIC_URL', () => {
  assert.equal(requestOrigin(new Request(`${preview}/api/auth/sign-in/email`), production, pattern), preview)
})

test('the production origin still uses PUBLIC_URL when a preview pattern is set', () => {
  assert.equal(requestOrigin(new Request(`${production}/api/plans`), production, pattern), production)
})

test('a non-matching host or scheme still uses PUBLIC_URL', () => {
  const hosts = [
    'https://evil.workers.dev',
    'https://a.b-visual-living-plan.mcalderon-code.workers.dev',
    'http://alias-visual-living-plan.mcalderon-code.workers.dev',
  ]
  for (const host of hosts) {
    assert.equal(requestOrigin(new Request(`${host}/api/plans`), production, pattern), production)
  }
})

test('without TRUSTED_ORIGINS the public origin is unchanged', () => {
  assert.equal(requestOrigin(new Request(`${preview}/api/plans`), production), production)
  assert.equal(requestOrigin(new Request(`${preview}/api/plans`)), preview)
})

test('a loopback hint still wins on loopback when the request URL matches a trusted origin', () => {
  const local = new Request(`${preview}/api/plans`, {
    headers: { 'cf-connecting-ip': '127.0.0.1', 'x-living-plan-origin': '127.0.0.1:8787' },
  })
  assert.equal(requestOrigin(local, production, pattern), 'http://127.0.0.1:8787')
})

test('parseTrustedOrigins drops empty and non-https entries', () => {
  assert.deepEqual(parseTrustedOrigins(undefined), [])
  assert.deepEqual(parseTrustedOrigins(''), [])
  assert.deepEqual(
    parseTrustedOrigins(' https://ok.example, http://no.example, , nope, HTTPS://no.example, https://also.example '),
    ['https://ok.example', 'https://also.example'],
  )
})

test('origin matching is an exact https origin or one hostname run', () => {
  assert.equal(originMatches(preview, pattern), true)
  assert.equal(originMatches('https://Alias-Visual-Living-Plan.mcalderon-code.workers.dev', pattern), true)
  assert.equal(originMatches(production, production), true)
  assert.equal(originMatches(preview, production), false)
  assert.equal(originMatches(`${preview}/path`, pattern), false)
  assert.equal(originMatches('https://user:pass@alias-visual-living-plan.mcalderon-code.workers.dev', pattern), false)
  assert.equal(originMatches(preview, `${pattern}/extra`), false)
  assert.equal(originMatches(`${preview}:8443`, pattern), false)
  assert.equal(originMatches('https://-visual-living-plan.mcalderon-code.workers.dev', pattern), false)
})
