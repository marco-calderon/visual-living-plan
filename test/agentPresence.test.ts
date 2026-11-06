import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AGENT_LEASE_MS, agentPresence, agentPresenceText, readAgentPresence } from '../src/agentPresence.ts'
import { hostedAgentPresence } from '../src/host/hostedDashboard.ts'
import { planActivity } from '../src/dashboard.ts'

test('presence counts open agent streams', () => {
  assert.deepEqual(agentPresence(0, null), { connected: false, clients: 0, seenAt: null })
  assert.deepEqual(agentPresence(2, 5), { connected: true, clients: 2, seenAt: 5 })
})

test('presence from a stream event is checked before use', () => {
  assert.equal(readAgentPresence(null), null)
  assert.equal(readAgentPresence({ clients: 1 }), null)
  assert.deepEqual(readAgentPresence({ connected: true }), { connected: true, clients: 1, seenAt: null })
  assert.deepEqual(readAgentPresence({ connected: false, clients: 0, seenAt: 42 }), { connected: false, clients: 0, seenAt: 42 })
})

test('presence text says when the agent was last seen', () => {
  const now = 3 * 60 * 60_000
  assert.equal(agentPresenceText({ connected: true, seenAt: 0 }, now), 'Agent connected')
  assert.equal(agentPresenceText({ connected: false, seenAt: null }, now), 'No agent connected')
  assert.equal(agentPresenceText({ connected: false, seenAt: now - 10_000 }, now), 'No agent connected · last seen just now')
  assert.equal(agentPresenceText({ connected: false, seenAt: now - 2 * 60 * 60_000 }, now), 'No agent connected · last seen 2h ago')
})

test('an open plan is active only with an agent connected', () => {
  assert.equal(planActivity({ status: 'running', agentConnected: true }), 'active')
  assert.equal(planActivity({ status: 'running', agentConnected: false }), 'idle')
  assert.equal(planActivity({ status: 'running' }), 'idle')
  assert.equal(planActivity({ status: 'executed', agentConnected: true }), 'executed')
  assert.equal(planActivity({ status: 'interrupted' }), 'interrupted')
})

test('a hosted row stays connected only while its lease is renewed', () => {
  const now = 1_000_000
  const meta = (fields: Record<string, unknown>) => JSON.stringify({ tier: 'free', ...fields })
  assert.deepEqual(hostedAgentPresence(null, now), { agentConnected: false, agentSeenAt: null })
  assert.deepEqual(hostedAgentPresence(meta({ agentConnected: true, agentSeenAt: 900_000, agentCheckedAt: now - 1_000 }), now), {
    agentConnected: true,
    agentSeenAt: 900_000,
  })
  // A plan object that restarted without seeing its sockets close stops renewing.
  assert.equal(hostedAgentPresence(meta({ agentConnected: true, agentCheckedAt: now - AGENT_LEASE_MS - 1 }), now).agentConnected, false)
  assert.equal(hostedAgentPresence(meta({ agentConnected: false, agentCheckedAt: now }), now).agentConnected, false)
  assert.equal(hostedAgentPresence('not json', now).agentConnected, false)
})
