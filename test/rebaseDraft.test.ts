import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { applyBlockEdit } from '../src/planMdx/blockEdit.ts'
import { compilePlanMdx } from '../src/planMdx/compilePlanMdx.ts'
import { blockText, parseBlockRange } from '../src/planMdx/remarkBlockRanges.ts'
import { rebaseDraft } from '../src/planMdx/rebaseDraft.ts'
import { planSourceToMdx } from '../src/planMdx/source.ts'
import { planNotReadyReason } from '../src/planReady.ts'

const base = `---
title: Rebase
---

# Rollout

Ship the limiter behind a flag.

<phase id="build" title="Build it" status="active">
First line of the phase.

<callout kind="risk" title="Redis">
Redis can go away.
</callout>
</phase>

<choice id="mode" prompt="Fail open or closed?">
<option id="open" label="Open">Allow traffic.</option>
</choice>

## Notes

Keep the dashboards up.

<workflow id="flow" title="Flow">
\`\`\`workflow
build | Build it | build
mode | Pick a mode | mode
--
build -> mode
\`\`\`
</workflow>
`

/** The block range the page gives the block that starts with `starts`. */
async function rangeOf(source: string, starts: string) {
  const compiled = String(await compilePlanMdx(planSourceToMdx(source)))
  for (const match of compiled.matchAll(/"data-plan-block": "(\d+-\d+)"/g)) {
    const range = parseBlockRange(match[1])
    if (range && blockText(source, range).startsWith(starts)) return range
  }
  assert.fail(`no block starts with ${starts}`)
}

/** The person's edit, made the way Done makes it on the page. */
async function edit(source: string, starts: string, edited: string): Promise<string> {
  return applyBlockEdit(source, { kind: 'replace', range: await rangeOf(source, starts), edited })
}

async function insertAfter(source: string, starts: string | null, edited: string): Promise<string> {
  const after = starts === null ? null : await rangeOf(source, starts)
  return applyBlockEdit(source, { kind: 'insert', after, edited })
}

async function assertCompiles(source: string): Promise<void> {
  assert.equal(await planNotReadyReason(source), undefined)
  await compilePlanMdx(planSourceToMdx(source))
}

test('edits to different blocks both land, and the rest of theirs stays byte for byte', async () => {
  const mine = await edit(base, 'Ship the limiter', 'Ship the limiter to everyone.')
  const theirs = base.replace('Keep the dashboards up.', 'Keep the dashboards up for a week.')
  const result = rebaseDraft({ base, mine, theirs })
  assert.deepEqual(result.conflicts, [])
  assert.equal(result.source, theirs.replace('Ship the limiter behind a flag.', 'Ship the limiter to everyone.'))
  await assertCompiles(result.source)
})

test('the agent spacing and formatting survive around the blocks the person changed', () => {
  const spaced = base.replace('# Rollout\n\n', '# Rollout\n\n\n\n').replace('## Notes', '##   Notes')
  const mine = base.replace('Ship the limiter behind a flag.', 'Ship it.')
  const result = rebaseDraft({ base, mine, theirs: spaced })
  assert.deepEqual(result.conflicts, [])
  assert.equal(result.source, spaced.replace('Ship the limiter behind a flag.', 'Ship it.'))
})

test('nothing changed on one side gives the other side as it is', () => {
  const theirs = base.replace('Keep the dashboards up.', 'Dashboards first.')
  const mine = base.replace('# Rollout', '# Roll it out')
  assert.equal(rebaseDraft({ base, mine: base, theirs }).source, theirs)
  assert.equal(rebaseDraft({ base, mine, theirs: base }).source, mine)
  assert.equal(rebaseDraft({ base, mine, theirs: mine }).source, mine)
})

test('a block the person added goes after the same block in theirs', async () => {
  const mine = await insertAfter(base, 'Ship the limiter', 'A new note from the person.')
  const theirs = base.replace('# Rollout', '# Rollout plan').replace('Keep the dashboards up.', 'Watch the 429s.')
  const result = rebaseDraft({ base, mine, theirs })
  assert.deepEqual(result.conflicts, [])
  assert.equal(
    result.source,
    theirs.replace('Ship the limiter behind a flag.\n\n', 'Ship the limiter behind a flag.\n\nA new note from the person.\n\n'),
  )
  await assertCompiles(result.source)
})

test('a block added at the end stays at the end, and the agent addition stays where the agent put it', async () => {
  const mine = await insertAfter(base, null, 'The person closes with this.')
  const theirs = base.replace('## Notes\n', '## Notes\n\nThe agent adds a line.\n')
  const result = rebaseDraft({ base, mine, theirs })
  assert.deepEqual(result.conflicts, [])
  assert.match(result.source, /## Notes\n\nThe agent adds a line\.\n\nKeep the dashboards up\./)
  assert.match(result.source, /<\/workflow>\n\nThe person closes with this\.\n$/)
})

test('when the agent removed the block before an added one, it goes after the nearest block still there', async () => {
  const mine = await insertAfter(base, 'Ship the limiter', 'Added after the intro.')
  const theirs = base.replace('Ship the limiter behind a flag.\n\n', '')
  const result = rebaseDraft({ base, mine, theirs })
  assert.deepEqual(result.conflicts, [])
  assert.match(result.source, /# Rollout\n\nAdded after the intro\.\n\n<phase id="build"/)
  await assertCompiles(result.source)
})

test('a block the person removed is removed when the agent left it alone', async () => {
  const mine = await edit(base, 'Keep the dashboards', '')
  const theirs = base.replace('# Rollout', '# Rollout plan')
  const result = rebaseDraft({ base, mine, theirs })
  assert.deepEqual(result.conflicts, [])
  assert.doesNotMatch(result.source, /Keep the dashboards/)
  assert.match(result.source, /## Notes\n\n<workflow id="flow"/)
  assert.match(result.source, /^# Rollout plan$/m)
  await assertCompiles(result.source)
})

test('the same change on both sides is not a conflict', async () => {
  const mine = await edit(base, 'Ship the limiter', 'Ship the limiter to everyone.')
  const theirs = base.replace('Ship the limiter behind a flag.', 'Ship the limiter to everyone.').replace('## Notes', '## Notes and risks')
  const result = rebaseDraft({ base, mine, theirs })
  assert.deepEqual(result.conflicts, [])
  assert.equal(result.source, theirs)
})

test('both changing one block differently is a conflict: theirs stays until a side is kept', async () => {
  const mine = await edit(base, 'Ship the limiter', 'Ship the limiter to everyone.')
  const theirs = base.replace('Ship the limiter behind a flag.', 'Ship the limiter to half the traffic.').replace('# Rollout', '# Rollout plan')
  const result = rebaseDraft({ base, mine, theirs })
  assert.equal(result.source, theirs)
  assert.equal(result.conflicts.length, 1)
  const [conflict] = result.conflicts
  assert.equal(conflict?.label, 'Ship the limiter to half the traffic.')
  assert.equal(conflict?.mine, 'Ship the limiter to everyone.')
  assert.equal(conflict?.theirs, 'Ship the limiter to half the traffic.')
  assert.equal(conflict?.minePreview, 'Ship the limiter to everyone.')
  assert.equal(conflict?.within, undefined)

  const kept = rebaseDraft({ base, mine, theirs, keep: { [conflict!.key]: 'mine' } })
  assert.deepEqual(kept.conflicts, [])
  assert.equal(kept.source, theirs.replace('Ship the limiter to half the traffic.', 'Ship the limiter to everyone.'))
  const theirsKept = rebaseDraft({ base, mine, theirs, keep: { [conflict!.key]: 'theirs' } })
  assert.deepEqual(theirsKept.conflicts, [])
  assert.equal(theirsKept.source, theirs)

  // The agent writes again: the same block keeps the same key, so a choice already made still holds.
  const again = theirs.replace('Keep the dashboards up.', 'Keep the dashboards up all week.')
  const later = rebaseDraft({ base, mine, theirs: again })
  assert.equal(later.conflicts[0]?.key, conflict?.key)
  assert.match(rebaseDraft({ base, mine, theirs: again, keep: { [conflict!.key]: 'mine' } }).source, /Ship the limiter to everyone\.\n[\s\S]*all week/)
})

test('a heading conflict is named by its heading text', () => {
  const mine = base.replace('## Notes', '## Open notes')
  const theirs = base.replace('## Notes', '## Risks')
  const [conflict] = rebaseDraft({ base, mine, theirs }).conflicts
  assert.equal(conflict?.label, 'Risks')
  assert.equal(conflict?.mine, '## Open notes')
})

test('removing a block the agent changed is a conflict, and keeping mine removes it', async () => {
  const mine = await edit(base, 'Keep the dashboards', '')
  const theirs = base.replace('Keep the dashboards up.', 'Keep the dashboards up, and page on 5xx.')
  const result = rebaseDraft({ base, mine, theirs })
  assert.equal(result.source, theirs)
  assert.equal(result.conflicts.length, 1)
  assert.equal(result.conflicts[0]?.mine, '')
  assert.equal(result.conflicts[0]?.theirs, 'Keep the dashboards up, and page on 5xx.')
  const kept = rebaseDraft({ base, mine, theirs, keep: { [result.conflicts[0]!.key]: 'mine' } })
  assert.doesNotMatch(kept.source, /Keep the dashboards/)
  await assertCompiles(kept.source)
})

test('changing a block the agent removed is a conflict, and keeping mine puts it back in its place', async () => {
  const mine = await edit(base, 'Keep the dashboards', 'Keep the dashboards up for two weeks.')
  const theirs = base.replace('Keep the dashboards up.\n\n', '')
  const result = rebaseDraft({ base, mine, theirs })
  assert.equal(result.source, theirs)
  assert.equal(result.conflicts[0]?.theirs, '')
  assert.equal(result.conflicts[0]?.mine, 'Keep the dashboards up for two weeks.')
  const kept = rebaseDraft({ base, mine, theirs, keep: { [result.conflicts[0]!.key]: 'mine' } })
  assert.match(kept.source, /## Notes\n\nKeep the dashboards up for two weeks\.\n\n<workflow/)
})

test('an edit inside a phase merges with the agent changing that phase status and another of its blocks', async () => {
  const mine = await edit(base, 'First line of the phase.', 'First line, as the person wrote it.')
  const theirs = base.replace('status="active"', 'status="done"').replace('Redis can go away.', 'Redis restarts nightly.')
  const result = rebaseDraft({ base, mine, theirs })
  assert.deepEqual(result.conflicts, [])
  assert.equal(result.source, theirs.replace('First line of the phase.', 'First line, as the person wrote it.'))
  await assertCompiles(result.source)
})

test('a conflict inside a phase names the phase, and keeping mine changes only that block', async () => {
  const mine = await edit(base, '<callout', '<callout kind="risk" title="Redis">\nRedis can go away for a minute.\n</callout>')
  const theirs = base.replace('Redis can go away.', 'Redis is a hard dependency.').replace('First line of the phase.', 'The agent rewrote this.')
  const result = rebaseDraft({ base, mine, theirs })
  assert.equal(result.source, theirs)
  assert.equal(result.conflicts.length, 1)
  const [conflict] = result.conflicts
  assert.equal(conflict?.label, 'Redis')
  assert.equal(conflict?.within, 'Build it')
  assert.match(conflict?.mine ?? '', /^<callout kind="risk" title="Redis">\nRedis can go away for a minute\.\n<\/callout>$/)
  assert.equal(conflict?.minePreview, 'Redis can go away for a minute.')
  const kept = rebaseDraft({ base, mine, theirs, keep: { [conflict!.key]: 'mine' } })
  assert.equal(kept.source, theirs.replace('Redis is a hard dependency.', 'Redis can go away for a minute.'))
  await assertCompiles(kept.source)
})

test('a block added inside a phase goes after its neighbour there', async () => {
  const mine = await insertAfter(base, 'First line of the phase.', 'A second line in the phase.')
  const theirs = base.replace('status="active"', 'status="blocked"')
  const result = rebaseDraft({ base, mine, theirs })
  assert.deepEqual(result.conflicts, [])
  assert.match(result.source, /status="blocked">\nFirst line of the phase\.\n\nA second line in the phase\.\n\n<callout/)
})

test('phase attributes merge one by one, and one changed both ways is a conflict', () => {
  const mine = base.replace('title="Build it"', 'title="Build the limiter"')
  const theirs = base.replace('status="active"', 'status="done"').replace('First line of the phase.', 'Built.')
  const clean = rebaseDraft({ base, mine, theirs })
  assert.deepEqual(clean.conflicts, [])
  assert.match(clean.source, /<phase id="build" title="Build the limiter" status="done">\nBuilt\./)

  const clash = base.replace('title="Build it"', 'title="Build and test"').replace('First line of the phase.', 'Built.')
  const result = rebaseDraft({ base, mine, theirs: clash })
  assert.equal(result.source, clash)
  assert.equal(result.conflicts.length, 1)
  assert.equal(result.conflicts[0]?.label, 'Build and test (title)')
  const kept = rebaseDraft({ base, mine, theirs: clash, keep: { [result.conflicts[0]!.key]: 'mine' } })
  assert.match(kept.source, /<phase id="build" title="Build the limiter" status="active">\nBuilt\./)
})

test('a card the agent moved still takes the person change, by its id', async () => {
  const mine = await edit(base, '<choice', '<choice id="mode" prompt="Fail open or closed, finally?">\n<option id="open" label="Open">Allow traffic.</option>\n</choice>')
  const choice = '<choice id="mode" prompt="Fail open or closed?">\n<option id="open" label="Open">Allow traffic.</option>\n</choice>\n\n'
  const theirs = base.replace(choice, '').replace('<workflow id="flow"', `${choice}<workflow id="flow"`)
  const result = rebaseDraft({ base, mine, theirs })
  assert.deepEqual(result.conflicts, [])
  assert.match(result.source, /Keep the dashboards up\.\n\n<choice id="mode" prompt="Fail open or closed, finally\?">/)
  assert.equal((result.source.match(/<choice /g) ?? []).length, 1)
})

test('a new phase the person added keeps its workflow step when the agent changed the workflow', async () => {
  const mine = await insertAfter(base, '<phase id="build"', '<phase id="ship" title="Ship it" status="pending">\nRoll out.\n</phase>')
  assert.match(mine, /build -> ship\nship -> mode/)
  const theirs = base
    .replace('mode | Pick a mode | mode\n', 'mode | Pick a mode | mode\nwatch | Watch it | watch\n')
    .replace('build -> mode\n', 'build -> mode\nmode -> watch\n')
    .replace('## Notes', '<phase id="watch" title="Watch it" status="pending">\nWatch the 429s.\n</phase>\n\n## Notes')
  const result = rebaseDraft({ base, mine, theirs })
  assert.deepEqual(result.conflicts, [])
  assert.match(result.source, /<\/phase>\n\n<phase id="ship" title="Ship it" status="pending">\nRoll out\.\n<\/phase>\n\n<choice/)
  const fence = /```workflow\n([\s\S]*?)```/.exec(result.source)?.[1] ?? ''
  assert.equal(fence, 'build | Build it | build\nship | Ship it | ship\nmode | Pick a mode | mode\nwatch | Watch it | watch\n--\nbuild -> ship\nship -> mode\nmode -> watch\n')
  await assertCompiles(result.source)
})

test('a new phase is wired onto the workflow even when the agent left the workflow alone', async () => {
  const mine = await insertAfter(base, '<phase id="build"', '<phase id="ship" title="Ship it" status="pending">\nRoll out.\n</phase>')
  const theirs = base.replace('First line of the phase.', 'The agent changed this.')
  const result = rebaseDraft({ base, mine, theirs })
  assert.deepEqual(result.conflicts, [])
  assert.match(result.source, /build \| Build it \| build\nship \| Ship it \| ship\nmode/)
  assert.match(result.source, /The agent changed this\./)
  await assertCompiles(result.source)
})

test('a new step the person routed by hand counts as a workflow change of their own', async () => {
  const added = await insertAfter(base, '<phase id="build"', '<phase id="ship" title="Ship it" status="pending">\nRoll out.\n</phase>')
  const mine = added.replace('ship -> mode', 'ship -> mode @ right>left')
  const theirs = base.replace('mode | Pick a mode | mode', 'mode | Choose the mode | mode')
  const result = rebaseDraft({ base, mine, theirs })
  assert.equal(result.conflicts.length, 1)
  assert.match(result.conflicts[0]?.mine ?? '', /ship -> mode @ right>left/)
  // The new phase itself still lands.
  assert.match(result.source, /<phase id="ship" title="Ship it"/)
})

test('a workflow the person changed by hand is an ordinary block', () => {
  const mine = base.replace('build -> mode', 'build -> mode @ right>left')
  const theirs = base.replace('mode | Pick a mode | mode', 'mode | Choose the mode | mode')
  const result = rebaseDraft({ base, mine, theirs })
  assert.equal(result.conflicts.length, 1)
  assert.equal(result.conflicts[0]?.label, 'Flow')
  assert.equal(result.source, theirs)
})

test('both adding a card with the same id is a conflict unless they wrote the same card', async () => {
  const card = '<callout id="note" kind="note" title="Heads up">\nFrom the person.\n</callout>'
  const mine = await insertAfter(base, 'Ship the limiter', card)
  const same = base.replace('Ship the limiter behind a flag.\n\n', `Ship the limiter behind a flag.\n\n${card}\n\n`)
  assert.equal(rebaseDraft({ base, mine, theirs: same }).source, same)
  const other = same.replace('From the person.', 'From the agent.')
  const result = rebaseDraft({ base, mine, theirs: other })
  assert.equal(result.source, other)
  assert.equal(result.conflicts.length, 1)
  assert.equal(result.conflicts[0]?.label, 'Heads up')
  const kept = rebaseDraft({ base, mine, theirs: other, keep: { [result.conflicts[0]!.key]: 'mine' } })
  assert.equal(kept.source, same)
})

test('front matter takes theirs unless only the person changed it', () => {
  const theirsMeta = base.replace('title: Rebase', 'title: Rebase\nsummary: From the agent')
  const mineMeta = base.replace('title: Rebase', 'title: Rebased by me')
  const mineBody = base.replace('# Rollout', '# Roll it out')
  assert.match(rebaseDraft({ base, mine: mineBody, theirs: theirsMeta }).source, /^---\ntitle: Rebase\nsummary: From the agent\n---\n\n# Roll it out\n/)
  const theirsBody = base.replace('Keep the dashboards up.', 'Dashboards.')
  assert.match(rebaseDraft({ base, mine: mineMeta, theirs: theirsBody }).source, /^---\ntitle: Rebased by me\n---\n[\s\S]*Dashboards\./)
  assert.match(rebaseDraft({ base, mine: mineMeta, theirs: theirsMeta }).source, /^---\ntitle: Rebase\nsummary: From the agent\n---/)
})

test('several edits at once, on the real example plan, still compile after the agent works through it', async () => {
  const plan = await readFile(resolve('examples/rate-limit.plan.md'), 'utf8')
  let mine = await edit(plan, 'We add a sliding-window limiter', 'We add a sliding-window limiter at the gateway. Edited on the page.')
  mine = await edit(mine, 'Wire the limiter', 'Wire the limiter into the request path, behind a flag.')
  mine = await insertAfter(mine, '<phase id="design"', '<phase id="review" title="Review the design" status="pending">\nA second pair of eyes.\n</phase>')
  const theirs = plan
    .replace('<phase id="implement" title="Implement gateway middleware" status="active">', '<phase id="implement" title="Implement gateway middleware" status="done">')
    .replace('implement | Implement gateway middleware | implement\n', 'implement | Implement gateway middleware | implement\ncanary | Canary the limiter | canary\n')
    .replace('implement -> observe', 'implement -> canary\ncanary -> observe')
  const result = rebaseDraft({ base: plan, mine, theirs })
  assert.deepEqual(result.conflicts, [])
  assert.match(result.source, /Edited on the page\./)
  assert.match(result.source, /status="done">\nWire the limiter into the request path, behind a flag\./)
  assert.match(result.source, /canary \| Canary the limiter \| canary/)
  // The same steps the page wired for the new phase, now on the agent's workflow.
  for (const edge of ['design -> review', 'review -> implement', 'implement -> canary', 'canary -> observe']) {
    assert.ok(mine.includes(edge) || theirs.includes(edge), edge)
    assert.equal(result.source.split(`\n${edge}\n`).length, 2, edge)
  }
  await assertCompiles(result.source)
})

test('the person line of a long block shows where they changed it', () => {
  const long =
    'We add a sliding-window limiter at the gateway, behind a flag. This living plan is the status surface: phases update as work progresses.'
  const plan = `# Plan\n\n${long}\n`
  const mine = plan.replace('as work progresses.', 'as work progresses. Mine, from the page.')
  const theirs = plan.replace('This living plan', 'This plan')
  const [conflict] = rebaseDraft({ base: plan, mine, theirs }).conflicts
  assert.ok(conflict)
  assert.match(conflict.minePreview, /^….*Mine, from the page\.$/)
  assert.ok(conflict.minePreview.length <= 90)
  assert.equal(conflict.label, 'We add a sliding-window limiter at the gateway, behind a…')
})

test('a draft keeps its overlaps on the device, and one it cannot read falls back to the person version', async () => {
  const { readDraft, writeDraft } = await import('../client/editor/draftStore.ts')
  const items = new Map<string, string>()
  const previous = (globalThis as { window?: unknown }).window
  ;(globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => items.set(key, value),
      removeItem: (key: string) => items.delete(key),
    },
  }
  try {
    const mine = base.replace('Ship the limiter behind a flag.', 'Mine.')
    const theirs = base.replace('Ship the limiter behind a flag.', 'Theirs.')
    const result = rebaseDraft({ base, mine, theirs })
    const draft = {
      base: theirs,
      source: result.source,
      edits: 1,
      savedAt: 5,
      rebase: { base, mine, keep: { other: 'mine' as const }, conflicts: result.conflicts },
    }
    assert.equal(writeDraft('p', draft), true)
    assert.deepEqual(readDraft('p'), draft)
    // An older draft has no overlaps, and reads as it did.
    items.set('living-plan:draft:old', JSON.stringify({ base, source: mine, edits: 2, savedAt: 1 }))
    assert.deepEqual(readDraft('old'), { base, source: mine, edits: 2, savedAt: 1 })
    // Overlaps this page cannot read give back the person's own version, to merge again.
    items.set('living-plan:draft:bad', JSON.stringify({ ...draft, rebase: { base, mine, keep: {}, conflicts: [{ key: 1 }] } }))
    assert.deepEqual(readDraft('bad'), { base, source: mine, edits: 1, savedAt: 5 })
  } finally {
    ;(globalThis as { window?: unknown }).window = previous
  }
})
