import assert from 'node:assert/strict'
import { test } from 'node:test'
import { linkProviderMessage } from '../src/LinkedProviders.tsx'

test('a failed provider link explains an email mismatch and a taken account', () => {
  assert.equal(linkProviderMessage('email_does_not_match'), 'That provider uses a different email than this account.')
  assert.equal(
    linkProviderMessage('account_already_linked_to_different_user'),
    'That provider is already linked to another account.',
  )
  assert.equal(linkProviderMessage('access_denied'), 'Could not link that provider. Try again.')
  assert.equal(linkProviderMessage(undefined), 'Could not link that provider. Try again.')
})
