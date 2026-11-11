import assert from 'node:assert/strict'
import { test } from 'node:test'
import { desktopAppDisabled, desktopLinkFor, openInDesktopApp, type DesktopOpenDeps } from '../src/desktopApp.ts'

function deps(overrides: Partial<DesktopOpenDeps> & { exit?: number | null } = {}) {
  const calls: Array<[string, string[]]> = []
  const value: DesktopOpenDeps = {
    platform: 'darwin',
    env: {},
    cloudUrl: async () => null,
    run: async (command, args) => {
      calls.push([command, args])
      return overrides.exit === undefined ? 0 : overrides.exit
    },
    ...overrides,
  }
  return { value, calls }
}

test('a plan or the dashboard on the local service has an app link', () => {
  assert.equal(desktopLinkFor('http://127.0.0.1:9477/plans/b8a6ff1c77eb83c9fda723ce/'), 'living-plan://plans/b8a6ff1c77eb83c9fda723ce')
  assert.equal(desktopLinkFor('http://127.0.0.1:9477/plans/abc'), 'living-plan://plans/abc')
  assert.equal(desktopLinkFor('http://localhost:9400/plans/abc/#step-2'), 'living-plan://plans/abc')
  assert.equal(desktopLinkFor('http://127.0.0.1:9477/dashboard'), 'living-plan://dashboard')
})

test('pages the app does not show have no link', () => {
  // A hosted plan, a LAN or --host address, a private --no-registry server, and other paths.
  assert.equal(desktopLinkFor('https://plan.example.com/plans/abc'), null)
  assert.equal(desktopLinkFor('http://living-plan.local:9477/plans/abc/'), null)
  assert.equal(desktopLinkFor('http://192.168.1.20:9477/plans/abc/'), null)
  assert.equal(desktopLinkFor('http://127.0.0.1:51234/'), null)
  assert.equal(desktopLinkFor('http://127.0.0.1:9477/plans/abc/versions/2'), null)
  assert.equal(desktopLinkFor('http://127.0.0.1:9477/plans/a%2Fb/'), null)
  assert.equal(desktopLinkFor('not a url'), null)
})

test('LIVE_PLAN_DESKTOP=0 keeps pages in the browser', () => {
  for (const value of ['0', 'off', 'false', 'no', ' OFF ']) assert.equal(desktopAppDisabled({ LIVE_PLAN_DESKTOP: value }), true)
  for (const value of [undefined, '', '1', 'on']) assert.equal(desktopAppDisabled({ LIVE_PLAN_DESKTOP: value }), false)
})

test('on macOS the plan opens through the app link', async () => {
  const { value, calls } = deps()
  assert.equal(await openInDesktopApp('http://127.0.0.1:9477/plans/abc/', value), true)
  assert.deepEqual(calls, [['open', ['living-plan://plans/abc']]])
})

test('when no app claims the scheme, the caller opens the browser', async () => {
  const { value } = deps({ exit: 1 })
  assert.equal(await openInDesktopApp('http://127.0.0.1:9477/plans/abc/', value), false)
  const { value: failed } = deps({ exit: null })
  assert.equal(await openInDesktopApp('http://127.0.0.1:9477/plans/abc/', failed), false)
})

test('other platforms, a disabled app, and pages without a link never try the app', async () => {
  for (const options of [
    { platform: 'linux' as const },
    { platform: 'win32' as const },
    { env: { LIVE_PLAN_DESKTOP: '0' } },
  ]) {
    const { value, calls } = deps(options)
    assert.equal(await openInDesktopApp('http://127.0.0.1:9477/plans/abc/', value), false)
    assert.deepEqual(calls, [])
  }
  const { value, calls } = deps()
  assert.equal(await openInDesktopApp('https://plan.example.com/plans/abc', value), false)
  assert.deepEqual(calls, [])
})

test('a page on the hosted app the desktop app knows has a cloud link', () => {
  const cloud = 'https://plans.example.com'
  assert.equal(desktopLinkFor('https://plans.example.com/plans/abc', cloud), 'living-plan://cloud/plans/abc')
  assert.equal(desktopLinkFor('https://plans.example.com/dashboard', cloud), 'living-plan://cloud/dashboard')
  // Another host, another path, and a local page are not cloud pages.
  assert.equal(desktopLinkFor('https://other.example.com/plans/abc', cloud), null)
  assert.equal(desktopLinkFor('http://plans.example.com/plans/abc', cloud), null)
  assert.equal(desktopLinkFor('https://plans.example.com/plans/abc/versions/2', cloud), null)
  assert.equal(desktopLinkFor('http://127.0.0.1:9477/plans/abc/', cloud), 'living-plan://plans/abc')
  assert.equal(desktopLinkFor('https://plans.example.com/plans/abc', 'not a url'), null)
})

test('a hosted plan opens in the app when the app is set up with that host', async () => {
  const { value, calls } = deps({ cloudUrl: async () => 'https://plans.example.com' })
  assert.equal(await openInDesktopApp('https://plans.example.com/plans/abc', value), true)
  assert.deepEqual(calls, [['open', ['living-plan://cloud/plans/abc']]])
  const other = deps({ cloudUrl: async () => 'https://plans.example.com' })
  assert.equal(await openInDesktopApp('https://elsewhere.example.com/plans/abc', other.value), false)
  assert.deepEqual(other.calls, [])
})
