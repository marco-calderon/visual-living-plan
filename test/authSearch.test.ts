import assert from 'node:assert/strict'
import { test } from 'node:test'
import { authPath, authSearch } from '../src/authSearch.ts'

test('auth search keeps an in-app return path and the CLI callback', () => {
  assert.deepEqual(authSearch({ next: '/settings', cli: 'http://127.0.0.1:9477/callback' }), {
    next: '/settings',
    cli: 'http://127.0.0.1:9477/callback',
  })
  assert.deepEqual(authSearch({ next: 'https://example.com', cli: '' }), {})
  assert.deepEqual(authSearch({ next: '//example.com' }), {})
  assert.equal(authPath('/signup', { next: '/account', cli: 'http://127.0.0.1:9/cb' }), '/signup?next=%2Faccount&cli=http%3A%2F%2F127.0.0.1%3A9%2Fcb')
  assert.equal(authPath('/login', {}), '/login')
  assert.equal(authPath('/login', { next: '/settings', error: 'access_denied' }), '/login?next=%2Fsettings')
  assert.deepEqual(authSearch({ error: 'access_denied', next: 'https://example.com' }), { error: 'access_denied' })
})
