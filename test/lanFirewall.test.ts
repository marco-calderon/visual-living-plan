import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { applyLanFirewall } from '../src/lanCommand.ts'
import { closeLanFirewall, openLanFirewall, type CommandResult, type CommandRunner } from '../src/lanFirewall.ts'

function runner(script: (command: string, args: string[]) => CommandResult): {
  run: CommandRunner
  calls: Array<{ command: string; args: string[] }>
} {
  const calls: Array<{ command: string; args: string[] }> = []
  return {
    calls,
    run: async (command, args) => {
      calls.push({ command, args })
      return script(command, args)
    },
  }
}

test('a missing LAN address does not run a firewall command', async () => {
  const home = await mkdtemp(join(tmpdir(), 'lan-fw-'))
  const fake = runner(() => {
    throw new Error('firewall command ran')
  })
  try {
    const record = await applyLanFirewall({ home, port: 9477, address: null, run: fake.run })
    assert.equal(record.summary, 'skipped')
    assert.equal(record.added, false)
    assert.equal(fake.calls.length, 0)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('a failed firewall command reports the manual command and does not throw', async () => {
  const fake = runner((command) => {
    if (command === 'ufw') return { code: 1, stdout: '', stderr: 'ERROR: You need to be root' }
    return { code: 1, stdout: '', stderr: 'ERROR: You need to be root' }
  })
  const attempt = await openLanFirewall(9477, fake.run, 'linux')
  assert.equal(attempt.ok, false)
  assert.equal(attempt.record.added, false)
  assert.match(attempt.record.manual ?? '', /sudo ufw allow/)
  assert.match(attempt.record.summary, /Could not open the firewall/)
})

test('ufw records only the rules it added, and close deletes those rules', async () => {
  const fake = runner((command, args) => {
    if (command === 'ufw' && args[0] === 'status') return { code: 0, stdout: 'Status: inactive', stderr: '' }
    if (args.includes('10.0.0.0/8')) return { code: 0, stdout: 'Rule added', stderr: '' }
    if (args[0] === 'allow') return { code: 0, stdout: 'Skipping adding existing rule', stderr: '' }
    return { code: 0, stdout: 'ok', stderr: '' }
  })
  const opened = await openLanFirewall(9477, fake.run, 'linux')
  assert.equal(opened.ok, true)
  assert.equal(opened.record.added, true)
  assert.equal(opened.record.rules.length, 1)
  assert.equal(opened.record.rules[0]?.args.includes('10.0.0.0/8'), true)

  const closer = runner(() => ({ code: 0, stdout: 'deleted', stderr: '' }))
  const closed = await closeLanFirewall(opened.record, closer.run)
  assert.equal(closed.ok, true)
  assert.equal(closed.record.added, false)
  assert.equal(closer.calls.length, 1)
  assert.deepEqual(closer.calls[0]?.args.slice(0, 3), ['delete', 'allow', 'from'])
  assert.equal(closer.calls[0]?.args.includes('192.168.0.0/16'), false)

  const untouched = runner(() => {
    throw new Error('should not delete')
  })
  const skipped = await closeLanFirewall({ ...opened.record, added: false, rules: [] }, untouched.run)
  assert.equal(skipped.ok, true)
  assert.equal(skipped.record.added, false)
})

test('a missing firewall tool prints both manual commands', async () => {
  const fake = runner(() => ({ code: 127, stdout: '', stderr: 'not found' }))
  const attempt = await openLanFirewall(9477, fake.run, 'linux')
  assert.equal(attempt.ok, false)
  assert.match(attempt.record.manual ?? '', /ufw allow/)
  assert.match(attempt.record.manual ?? '', /firewall-cmd/)
  assert.equal(attempt.record.added, false)
})
