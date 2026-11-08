import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Database } from 'bun:sqlite'
import { allows } from '../src/host/access.ts'
import { editSource, initPlan, pendingEvents, planView, putExecution, putSource, StaleRevision, type PlanSql } from '../src/host/planRoom.ts'
import { uploadSource } from '../src/cloudClient.ts'
import { readCloudFile, writeCloudFile } from '../src/cloudStore.ts'
import { pullPageEdit } from '../src/pageEditPull.ts'

function sqlOf(db: Database): PlanSql {
  return {
    exec(query, ...bindings) {
      const statement = db.query(query)
      if (query.trim().toLowerCase().startsWith('select')) {
        return { toArray: () => statement.all(...bindings) as Array<Record<string, unknown>> }
      }
      statement.run(...bindings)
      return { toArray: () => [] }
    },
  }
}

function room() {
  const sql = sqlOf(new Database(':memory:'))
  initPlan(sql, { token: 'plan-token', title: 'Demo', mode: 'watch', tier: 'free', source: '# Demo\n' })
  return sql
}

test('only the owner can edit from the page; the agent uploads instead', () => {
  assert.equal(allows('account', 'edit'), true)
  assert.equal(allows('viewer', 'edit'), false)
  assert.equal(allows('plan', 'edit'), false)
  assert.equal(allows('account', 'upload'), false)
})

test('a page edit replaces the source, bumps the revision, and tells the agent with the new source', () => {
  const sql = room()
  const result = editSource(sql, { base: '# Demo\n', source: '# Demo\n\nEdited.\n' })
  assert.equal(result.revision, 1)
  assert.equal(planView(sql).source, '# Demo\n\nEdited.\n')
  assert.deepEqual(
    result.outbound.map((item) => item.event),
    ['notice', 'plan'],
  )
  const [edit] = pendingEvents(sql)
  assert.equal(edit?.event, 'edit')
  assert.equal((edit?.data as { source?: string }).source, '# Demo\n\nEdited.\n')
  assert.equal((edit?.data as { by?: string }).by, 'page')
})

test('a page edit from an old base is refused', () => {
  const sql = room()
  putSource(sql, { markdown: '# Agent\n', revision: 0 })
  assert.throws(() => editSource(sql, { base: '# Demo\n', source: '# Mine\n' }), /changed while you were editing/)
  assert.equal(planView(sql).source, '# Agent\n')
})

test('a page edit is refused while a run is live', () => {
  const sql = room()
  putExecution(sql, { active: true, step: 'x' })
  assert.throws(() => editSource(sql, { base: '# Demo\n', source: '# Mine\n' }), /execution is live/)
})

test('an agent upload that missed a page edit is refused instead of overwriting it', () => {
  const sql = room()
  editSource(sql, { base: '# Demo\n', source: '# Page\n' })
  assert.throws(
    () => putSource(sql, { markdown: '# Agent\n', revision: 0 }),
    (error: unknown) => error instanceof StaleRevision && error.pageEdit,
  )
  assert.equal(planView(sql).source, '# Page\n')
  // The agent wrote the pulled page edit into its file. Uploading that text just returns the revision.
  assert.equal(putSource(sql, { markdown: '# Page\n', revision: 0 }).revision, 1)
  // After that, a normal upload goes through.
  assert.equal(putSource(sql, { markdown: '# Agent\n', revision: 1 }).revision, 2)
})

test('the CLI does not retry an upload over a page edit', async () => {
  let calls = 0
  const fetchImpl: typeof fetch = async () => {
    calls += 1
    return Response.json({ revision: 3, pageEdit: true }, { status: 409 })
  }
  await assert.rejects(
    () => uploadSource({ planUrl: 'https://plans.example/plans/abc12345/', token: 't', markdown: '# A\n', revision: 1, fetchImpl }),
    /edited this plan on the page/,
  )
  assert.equal(calls, 1)
})

test('events writes a hosted page edit into the plan file and remembers its revision', async () => {
  const home = await mkdtemp(join(tmpdir(), 'live-plan-pull-'))
  try {
    const planPath = join(home, 'demo.plan.md')
    await writeFile(planPath, '# Old\n')
    await writeCloudFile(
      { plans: { abc12345: { id: 'abc12345', url: 'https://plans.example/plans/abc12345/', token: 't', planPath, revision: 1 } } },
      home,
    )
    const written = await pullPageEdit('https://plans.example/plans/abc12345', { source: '# New\n', revision: 4 }, home)
    assert.equal(written, planPath)
    assert.equal(await readFile(planPath, 'utf8'), '# New\n')
    assert.equal((await readCloudFile(home)).plans.abc12345?.revision, 4)
    // A local plan's edit has no source; the service already wrote the file.
    assert.equal(await pullPageEdit('https://plans.example/plans/abc12345/', { by: 'page' }, home), null)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
