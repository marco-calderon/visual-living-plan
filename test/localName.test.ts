import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatHttpOrigin, isLoopbackHost } from '../src/localName.ts'

test('formatHttpOrigin omits the default HTTP port and brackets IPv6', () => {
  assert.equal(formatHttpOrigin('127.0.0.1', 80), 'http://127.0.0.1')
  assert.equal(formatHttpOrigin('127.0.0.1', 9477), 'http://127.0.0.1:9477')
  assert.equal(formatHttpOrigin('localhost', 9477), 'http://localhost:9477')
  assert.equal(formatHttpOrigin('::1', 9477), 'http://[::1]:9477')
})

test('isLoopbackHost recognizes localhost and loopback addresses', () => {
  assert.equal(isLoopbackHost('127.0.0.1'), true)
  assert.equal(isLoopbackHost('localhost'), true)
  assert.equal(isLoopbackHost('[::1]'), true)
  assert.equal(isLoopbackHost('0.0.0.0'), false)
  assert.equal(isLoopbackHost('living-plan.local'), false)
  assert.equal(isLoopbackHost('visual-living-plan.local'), false)
})
