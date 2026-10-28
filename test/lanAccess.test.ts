import assert from 'node:assert/strict'
import { test } from 'node:test'
import { authorizeLan, grantLanEntry, LAN_COOKIE, lanSetCookie } from '../src/lanAccess.ts'

const secret = 'test-secret-value'

function allow(peer: string, pathname: string, extra: Partial<Parameters<typeof authorizeLan>[0]> = {}) {
  return authorizeLan({
    enabled: true,
    secret,
    method: 'GET',
    pathname,
    peer,
    cookie: null,
    querySecret: null,
    ...extra,
  })
}

test('loopback plan routes stay open and non-loopback plan routes require the secret', () => {
  assert.equal(allow('127.0.0.1', '/plans/abcdefghi/').action, 'allow')
  assert.equal(allow('::1', '/plans/abcdefghi/api/interactions/fail-mode', { method: 'POST' }).action, 'allow')
  assert.equal(allow('192.168.1.20', '/plans/abcdefghi/').action, 'deny')
  assert.equal(allow('192.168.1.20', '/plans/abcdefghi/api/interactions/fail-mode', { method: 'POST' }).action, 'deny')
  assert.equal(allow('192.168.1.20', '/plans/abcdefghi/', { cookie: secret }).action, 'allow')
  assert.equal(allow('192.168.1.20', '/plans/abcdefghi/', { querySecret: secret }).action, 'allow')
  assert.equal(allow('192.168.1.20', '/plans/abcdefghi/', { cookie: 'nope' }).action, 'deny')
  assert.equal(allow('10.0.0.4', '/plans/abcdefghi/').action, 'deny')
  assert.equal(allow('10.0.0.4', '/plans/abcdefghi/', { enabled: false }).action, 'allow')
})

test('the agent stream is not granted by the LAN cookie', () => {
  assert.equal(allow('192.168.1.20', '/plans/abcdefghi/api/agent-events').action, 'allow')
  assert.equal(allow('192.168.1.20', '/plans/abcdefghi/api/agent-events/ack', { method: 'POST' }).action, 'allow')
  assert.equal(allow('192.168.1.20', '/api/health').action, 'allow')
})

test('the LAN URL sets a cookie and redirects', () => {
  const granted = grantLanEntry(secret, secret, null)
  assert.equal(granted.action, 'redirect')
  if (granted.action !== 'redirect') return
  assert.equal(granted.location, '/dashboard')
  assert.match(granted.setCookie, new RegExp(`^${LAN_COOKIE}=`))
  assert.match(lanSetCookie(secret), /HttpOnly/)
  assert.equal(grantLanEntry('nope', secret, '/plans/abcdefghi/').action, 'deny')
  const next = grantLanEntry(secret, secret, '/plans/abcdefghi/')
  assert.equal(next.action, 'redirect')
  if (next.action === 'redirect') assert.equal(next.location, '/plans/abcdefghi/')
  const blocked = grantLanEntry(secret, secret, 'https://evil.example/')
  if (blocked.action === 'redirect') assert.equal(blocked.location, '/dashboard')
})
