import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { registerHostedPlan } from '../src/registryClient.ts'
import { startRegistryServer } from '../src/registryService.ts'
import { guardRequest } from '../src/requestGuard.ts'
import './logHome.ts'

const local = { peer: '127.0.0.1', bindHost: '127.0.0.1' }

test('a loopback peer must name this machine in Host', () => {
  for (const host of ['127.0.0.1:9477', 'localhost:9477', '[::1]:9477', 'living-plan.local:9477', '127.0.0.1']) {
    assert.equal(guardRequest({ ...local, method: 'GET', host, origin: null }).action, 'allow', host)
  }
  for (const host of ['evil.example:9477', 'evil.example', '', null]) {
    assert.equal(guardRequest({ ...local, method: 'GET', host, origin: null }).action, 'deny', String(host))
  }
  // A non-loopback --host is the name a cloud agent shares, so it is allowed too.
  assert.equal(
    guardRequest({ peer: '127.0.0.1', bindHost: 'devbox.internal', method: 'GET', host: 'devbox.internal:9477', origin: null }).action,
    'allow',
  )
})

test('a write from another origin is refused, and the CLI (no Origin) is not', () => {
  const host = '127.0.0.1:9477'
  assert.equal(guardRequest({ ...local, method: 'POST', host, origin: 'http://127.0.0.1:9477' }).action, 'allow')
  assert.equal(guardRequest({ ...local, method: 'POST', host, origin: null }).action, 'allow')
  assert.equal(guardRequest({ ...local, method: 'POST', host, origin: 'https://evil.example' }).action, 'deny')
  assert.equal(guardRequest({ ...local, method: 'POST', host, origin: 'null' }).action, 'deny')
  assert.equal(guardRequest({ ...local, method: 'PUT', host, origin: 'http://localhost:9477' }).action, 'deny')
  // Reads stay open to any origin; the browser's CORS rules keep the body from that page.
  assert.equal(guardRequest({ ...local, method: 'GET', host, origin: 'https://evil.example' }).action, 'allow')
  // LAN peers are checked by Origin too.
  const lan = { peer: '192.168.1.20', bindHost: '0.0.0.0', host: 'living-plan.local:9477' }
  assert.equal(guardRequest({ ...lan, method: 'POST', origin: 'http://living-plan.local:9477' }).action, 'allow')
  assert.equal(guardRequest({ ...lan, method: 'POST', origin: 'https://evil.example' }).action, 'deny')
})

test('the plan service refuses a cross-site approval and a rebound host', async () => {
  const home = await mkdtemp(join(tmpdir(), 'live-plan-guard-'))
  const registry = await startRegistryServer({ home, port: 0, token: 'test-token-value', advertise: false })
  try {
    const hosted = await registerHostedPlan(registry.url, registry.token, {
      planPath: resolve('examples/rate-limit.plan.md'),
      mode: 'review',
      cwd: process.cwd(),
    })
    const { host } = new URL(registry.url)
    const review = new URL(`/plans/${hosted.id}/api/review`, registry.url)
    const approve = JSON.stringify({ decision: 'approve' })

    const rebound = await fetch(new URL('/api/processes', registry.url), { headers: { host: 'evil.example' } })
    assert.equal(rebound.status, 403)

    const crossSite = await fetch(review, {
      method: 'POST',
      headers: { origin: 'https://evil.example', 'content-type': 'text/plain;charset=UTF-8' },
      body: approve,
    })
    assert.equal(crossSite.status, 403)

    const samePage = await fetch(review, {
      method: 'POST',
      headers: { origin: `http://${host}`, 'content-type': 'application/json' },
      body: approve,
    })
    assert.equal(samePage.status, 200)
  } finally {
    await registry.close()
  }
})
