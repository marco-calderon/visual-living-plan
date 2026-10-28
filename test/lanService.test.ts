import assert from 'node:assert/strict'
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { lanOn, lanOff } from '../src/lanCommand.ts'
import { ensureLanSecret, lanSecretPath, readLanEnabled, writeLanEnabled } from '../src/lanConfig.ts'
import { firewallCommandCount } from '../src/lanFirewall.ts'
import { mdnsPublishAttempts } from '../src/mdnsPublish.ts'
import { registerHostedPlan, registryBindUrl, registryHealthy, stopRegistry } from '../src/registryClient.ts'
import { readRegistryLock } from '../src/registryLock.ts'
import { startRegistryServer } from '../src/registryService.ts'

const planPath = resolve('examples/rate-limit.plan.md')
const secret = 'test-secret-value'

async function tempHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'live-plan-lan-'))
}

function choiceBody(): string {
  return JSON.stringify({
    kind: 'choice',
    id: 'fail-mode',
    optionId: 'open',
    label: 'Fail open',
  })
}

test('a fresh config binds loopback and does not publish or touch the firewall', async () => {
  const home = await tempHome()
  const publishes = mdnsPublishAttempts()
  const firewall = firewallCommandCount()
  const registry = await startRegistryServer({ home, port: 0, token: 'fresh-token' })
  try {
    assert.equal(registry.host, '127.0.0.1')
    assert.equal(registry.publishing, false)
    assert.equal(registry.url, `http://127.0.0.1:${registry.port}`)
    assert.equal(mdnsPublishAttempts(), publishes)
    assert.equal(firewallCommandCount(), firewall)
    const lock = await readRegistryLock(home)
    assert.ok(lock)
    assert.equal(registryBindUrl(lock), registry.url)
    assert.equal(registryBindUrl(lock).includes('.local'), false)
    assert.equal(await registryHealthy(registryBindUrl(lock)), true)
  } finally {
    await registry.close()
    await rm(home, { recursive: true, force: true })
  }
})

test('a wildcard bind still dials 127.0.0.1', async () => {
  const home = await tempHome()
  const registry = await startRegistryServer({
    home,
    host: '0.0.0.0',
    port: 0,
    token: 'bind-token',
    advertise: false,
  })
  try {
    assert.equal(registry.host, '0.0.0.0')
    assert.equal(registry.url, `http://127.0.0.1:${registry.port}`)
    const lock = await readRegistryLock(home)
    assert.ok(lock)
    assert.equal(lock.host, '0.0.0.0')
    assert.equal(registryBindUrl(lock), `http://127.0.0.1:${lock.port}`)
    assert.equal(registryBindUrl(lock).includes('.local'), false)
    assert.equal(await registryHealthy(registryBindUrl(lock)), true)
  } finally {
    await registry.close()
    await rm(home, { recursive: true, force: true })
  }
})

test('non-loopback plan requests need the LAN secret and loopback does not', async () => {
  const home = await tempHome()
  await writeLanEnabled(home, true)
  await ensureLanSecret(home)
  const secretPath = lanSecretPath(home)
  const mode = (await stat(secretPath)).mode & 0o777
  assert.equal(mode, 0o600)
  await chmod(secretPath, 0o600)
  await writeFile(secretPath, `${secret}\n`, { mode: 0o600 })

  const registry = await startRegistryServer({
    home,
    port: 0,
    token: 'lan-token',
    advertise: false,
    resolvePeer: (request) => request.headers.get('x-test-peer') ?? '127.0.0.1',
  })
  try {
    const hosted = await registerHostedPlan(registry.url, registry.token, {
      planPath,
      mode: 'watch',
      cwd: process.cwd(),
    })
    assert.equal(hosted.url.startsWith('http://127.0.0.1:'), true)
    assert.equal(hosted.url.includes('.local'), false)

    const loopback = await fetch(hosted.url)
    assert.equal(loopback.status, 200)
    assert.match(await loopback.text(), /Rate limiting rollout/)

    const deniedPage = await fetch(hosted.url, { headers: { 'x-test-peer': '192.168.1.40' } })
    assert.equal(deniedPage.status, 401)

    const deniedPost = await fetch(new URL('api/interactions/fail-mode', hosted.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-peer': '192.168.1.40' },
      body: choiceBody(),
    })
    assert.equal(deniedPost.status, 401)

    const allowedPost = await fetch(new URL('api/interactions/fail-mode', hosted.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: choiceBody(),
    })
    assert.equal(allowedPost.status, 200)

    const entry = await fetch(new URL(`/lan/${secret}`, registry.url), {
      headers: { 'x-test-peer': '192.168.1.40' },
      redirect: 'manual',
    })
    assert.equal(entry.status, 302)
    assert.equal(entry.headers.get('location'), '/dashboard')
    const setCookie = entry.headers.get('set-cookie') ?? ''
    assert.match(setCookie, /living_plan_lan=/)

    const withCookie = await fetch(hosted.url, {
      headers: { 'x-test-peer': '192.168.1.40', cookie: setCookie.split(';')[0] ?? '' },
    })
    assert.equal(withCookie.status, 200)

    const wrong = await fetch(new URL('/lan/nope', registry.url), {
      headers: { 'x-test-peer': '192.168.1.40' },
      redirect: 'manual',
    })
    assert.equal(wrong.status, 401)

    const stream = await fetch(new URL('api/agent-events', hosted.url), {
      headers: { authorization: `Bearer ${hosted.token}`, 'x-test-peer': '192.168.1.40' },
    })
    assert.equal(stream.status, 200)
    await stream.body?.cancel()

    const noToken = await fetch(new URL('api/agent-events', hosted.url), {
      headers: { 'x-test-peer': '192.168.1.40' },
    })
    assert.equal(noToken.status, 401)
  } finally {
    await registry.close()
    await rm(home, { recursive: true, force: true })
  }
})

test('lan on binds every interface and lan off returns the service to loopback', async () => {
  const home = await tempHome()
  const entry = fileURLToPath(new URL('../src/cli.ts', import.meta.url))
  try {
    const enabled = await lanOn(entry, home, { port: 0 })
    if (enabled !== 0) {
      const log = await readFile(join(home, 'registry.log'), 'utf8').catch(() => '')
      assert.fail(`lan on exited ${enabled}\n${log}`)
    }
    const wide = await readRegistryLock(home)
    assert.ok(wide)
    assert.equal(wide.host === '0.0.0.0' || wide.host === '::', true)
    assert.equal(registryBindUrl(wide).includes('.local'), false)
    assert.equal(await registryHealthy(registryBindUrl(wide)), true)
    assert.equal(await readLanEnabled(home), true)

    const disabled = await lanOff(entry, home)
    assert.equal(disabled, 0)
    const loop = await readRegistryLock(home)
    assert.ok(loop)
    assert.equal(loop.host, '127.0.0.1')
    assert.equal(registryBindUrl(loop), `http://127.0.0.1:${loop.port}`)
    assert.equal(await registryHealthy(registryBindUrl(loop)), true)
    assert.equal(await readLanEnabled(home), false)
  } finally {
    await stopRegistry(home)
    await rm(home, { recursive: true, force: true })
  }
})
