import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  directLoopbackUrl,
  formatHttpOrigin,
  installHostsName,
  isLoopbackHost,
  LOCAL_PLAN_HOSTNAME,
  localNameDesired,
  removeHostsName,
  removeHostsText,
  resolveLocalName,
  servicePublicOrigin,
  startTcpForward,
  upsertHostsText,
} from '../src/localName.ts'

test('formatHttpOrigin omits the default HTTP port and brackets IPv6', () => {
  assert.equal(formatHttpOrigin(LOCAL_PLAN_HOSTNAME, 80), 'http://living-plan.local')
  assert.equal(formatHttpOrigin(LOCAL_PLAN_HOSTNAME, 9477), 'http://living-plan.local:9477')
  assert.equal(formatHttpOrigin('::1', 9477), 'http://[::1]:9477')
})

test('directLoopbackUrl skips multicast DNS for browser links', () => {
  assert.equal(
    directLoopbackUrl('http://living-plan.local:9477/plans/abcdefghi/'),
    'http://127.0.0.1:9477/plans/abcdefghi/',
  )
  assert.equal(directLoopbackUrl('http://living-plan.local/dashboard'), 'http://127.0.0.1/dashboard')
  assert.equal(directLoopbackUrl('http://127.0.0.1:9477/plans/abcdefghi/'), 'http://127.0.0.1:9477/plans/abcdefghi/')
  assert.equal(directLoopbackUrl('http://example.com/plans/abcdefghi/'), 'http://example.com/plans/abcdefghi/')
})

test('servicePublicOrigin uses living-plan.local only for loopback', () => {
  assert.equal(
    servicePublicOrigin({ bindHost: '127.0.0.1', port: 9477, nameReady: true, portless: true }),
    'http://living-plan.local',
  )
  assert.equal(
    servicePublicOrigin({ bindHost: '127.0.0.1', port: 9477, nameReady: true, portless: false }),
    'http://living-plan.local:9477',
  )
  assert.equal(
    servicePublicOrigin({ bindHost: '127.0.0.1', port: 9477, nameReady: false, portless: true }),
    'http://127.0.0.1:9477',
  )
  assert.equal(
    servicePublicOrigin({ bindHost: '10.0.0.8', port: 9477, nameReady: true, portless: true }),
    'http://10.0.0.8:9477',
  )
  assert.equal(isLoopbackHost('localhost'), true)
  assert.equal(isLoopbackHost('[::1]'), true)
  assert.equal(isLoopbackHost('0.0.0.0'), false)
})

test('localNameDesired stays off unless LIVE_PLAN_LOCAL_NAME is explicitly on', () => {
  const previous = process.env.LIVE_PLAN_LOCAL_NAME
  delete process.env.LIVE_PLAN_LOCAL_NAME
  try {
    assert.equal(localNameDesired('127.0.0.1', 9477), false)
    assert.equal(localNameDesired('127.0.0.1', 0), false)
    assert.equal(localNameDesired('10.0.0.8', 9477), false)
    process.env.LIVE_PLAN_LOCAL_NAME = 'on'
    assert.equal(localNameDesired('127.0.0.1', 9477), true)
    process.env.LIVE_PLAN_LOCAL_NAME = 'off'
    assert.equal(localNameDesired('127.0.0.1', 9477), false)
  } finally {
    if (previous === undefined) delete process.env.LIVE_PLAN_LOCAL_NAME
    else process.env.LIVE_PLAN_LOCAL_NAME = previous
  }
})

test('hosts text adds a loopback alias and refuses a public address', () => {
  const added = upsertHostsText('127.0.0.1 localhost\n', LOCAL_PLAN_HOSTNAME)
  assert.equal(added.result, 'added')
  assert.match(added.text, /127\.0\.0\.1\tliving-plan\.local\t# visual-living-plan\n$/)
  assert.equal(upsertHostsText(added.text, LOCAL_PLAN_HOSTNAME).result, 'present')

  const custom = upsertHostsText('127.0.0.1 localhost living-plan.local\n', LOCAL_PLAN_HOSTNAME)
  assert.equal(custom.result, 'present')
  assert.equal(custom.text, '127.0.0.1 localhost living-plan.local\n')

  const conflict = upsertHostsText('10.1.2.3 living-plan.local\n', LOCAL_PLAN_HOSTNAME)
  assert.equal(conflict.result, 'conflict')
  assert.equal(conflict.text, '10.1.2.3 living-plan.local\n')
})

test('hosts removal deletes only the marked line', () => {
  const text = '127.0.0.1 localhost\n127.0.0.1\tliving-plan.local\t# visual-living-plan\n10.1.2.3 living-plan.local\n'
  const removed = removeHostsText(text, LOCAL_PLAN_HOSTNAME)
  assert.equal(removed.result, 'removed')
  assert.equal(removed.text, '127.0.0.1 localhost\n10.1.2.3 living-plan.local\n')
  assert.equal(removeHostsText('127.0.0.1 living-plan.local\n', LOCAL_PLAN_HOSTNAME).result, 'absent')
})

test('resolveLocalName trusts the hosts file and does not wait on mDNS', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'live-plan-hosts-'))
  const hosts = join(dir, 'hosts')
  try {
    await writeFile(hosts, `127.0.0.1\t${LOCAL_PLAN_HOSTNAME}\n`, 'utf8')
    const started = Date.now()
    const resolved = await resolveLocalName(LOCAL_PLAN_HOSTNAME, { hostsPath: hosts, lookupTimeoutMs: 50 })
    assert.equal(resolved.kind, 'ready')
    if (resolved.kind === 'ready') assert.deepEqual(resolved.addresses, ['127.0.0.1'])
    assert.ok(Date.now() - started < 1_000)

    const missingStarted = Date.now()
    const missing = await resolveLocalName('not-in-the-file.local', { hostsPath: hosts, lookupTimeoutMs: 200 })
    assert.equal(missing.kind, 'missing')
    assert.ok(Date.now() - missingStarted < 1_000)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('hosts file install and remove round-trip in a temp file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'live-plan-hosts-'))
  const hosts = join(dir, 'hosts')
  try {
    await writeFile(hosts, '127.0.0.1 localhost\n', 'utf8')
    assert.equal(await installHostsName(hosts, LOCAL_PLAN_HOSTNAME), 'added')
    assert.equal(await installHostsName(hosts, LOCAL_PLAN_HOSTNAME), 'present')
    const text = await readFile(hosts, 'utf8')
    assert.match(text, /living-plan\.local/)
    assert.equal(await removeHostsName(hosts, LOCAL_PLAN_HOSTNAME), 'removed')
    assert.equal(await readFile(hosts, 'utf8'), '127.0.0.1 localhost\n')
    assert.equal(await removeHostsName(hosts, LOCAL_PLAN_HOSTNAME), 'absent')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('tcp forwarder copies a loopback response', async () => {
  const target = createServer((_request, response) => {
    response.end('plan')
  })
  await new Promise<void>((resolveListen) => target.listen(0, '127.0.0.1', () => resolveListen()))
  const address = target.address()
  const targetPort = typeof address === 'object' && address ? address.port : 0
  const forwarder = await startTcpForward({ listenPort: 0, targetPort })
  try {
    const response = await fetch(`http://127.0.0.1:${forwarder.port}/`)
    assert.equal(response.status, 200)
    assert.equal(await response.text(), 'plan')
  } finally {
    await forwarder.stop()
    await new Promise<void>((resolveClose) => target.close(() => resolveClose()))
  }
})
