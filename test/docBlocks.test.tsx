import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { containsLocked, isLockedMdast, isLockedNodeDeep, lockedAttribute } from '../client/editor/locked.ts'
import { lockable } from '../client/planComponents.tsx'
import { fenceStartLine } from '../src/planMdx/remarkCodeMeta.ts'
import { compilePlanMdx } from '../src/planMdx/compilePlanMdx.ts'
import { checkState } from '../client/entries/Item.tsx'
import { Checklist } from '../client/entries/Checklist.tsx'
import { ItemContext } from '../client/entries/entryContext.ts'
import { Item } from '../client/entries/Item.tsx'
import { editLocked } from '../client/entries/planEntry.ts'
import {
  AnnotatedCode,
  Attr,
  buildFileTree,
  changeKind,
  Compare,
  DataModel,
  DOC_BLOCK_NAMES,
  Endpoint,
  EndpointResponse,
  Entity,
  File,
  FileTree,
  flag,
  healthOf,
  JsonView,
  lineRange,
  Note,
  Pane,
  Param,
  Path,
  Prop,
  Properties,
  readJson,
  Relation,
  relationKind,
  relativeTime,
  Tab,
  Tabs,
  Update,
} from '../client/mdx/docBlocks.tsx'
import { planHeaderInfo } from '../client/planHeader.ts'
import { buildMdxOutline } from '../src/planMdx/outline.ts'
import { parsePlan } from '../src/parse.ts'

function html(node: React.ReactNode): string {
  return renderToStaticMarkup(<>{node}</>)
}

describe('document block attributes', () => {
  test('a change reads from its usual words, and unknown words read as none', () => {
    expect(changeKind('added')).toBe('added')
    expect(changeKind('NEW')).toBe('added')
    expect(changeKind('modify')).toBe('modified')
    expect(changeKind('removed')).toBe('deleted')
    expect(changeKind('moved')).toBe('renamed')
    expect(changeKind('')).toBeUndefined()
    expect(changeKind('sideways')).toBeUndefined()
  })

  test('booleans are bare, "true", or {true}', () => {
    expect(flag(true)).toBe(true)
    expect(flag('')).toBe(true)
    expect(flag('true')).toBe(true)
    expect(flag('false')).toBe(false)
    expect(flag(undefined)).toBe(false)
  })

  test('line ranges, relation kinds, health, and relative dates', () => {
    expect(lineRange('42')).toEqual({ start: 42, end: 42 })
    expect(lineRange('42-44')).toEqual({ start: 42, end: 44 })
    expect(lineRange('44-42')).toBeNull()
    expect(lineRange('a')).toBeNull()
    expect(relationKind('1-n')).toBe('1:n')
    expect(relationKind(undefined)).toBe('→')
    expect(healthOf('on track')).toBe('on-track')
    expect(healthOf('At-Risk')).toBe('at-risk')
    expect(healthOf('off_track')).toBe('off-track')
    expect(healthOf('fine')).toBeUndefined()
    const now = Date.parse('2026-11-13T12:00:00Z')
    expect(relativeTime('2026-11-13T10:00:00Z', now)).toBe('2h ago')
    expect(relativeTime('2026-11-10T12:00:00Z', now)).toBe('3d ago')
    expect(relativeTime('next week', now)).toBeNull()
    // A date without a time counts in days.
    expect(relativeTime('2026-11-13', now)).toBe('today')
    expect(relativeTime('2026-11-10', now)).toBe('3d ago')
    expect(relativeTime('2026-11-14T12:00:00Z', now)).toBeNull()
  })

  test('JSON that does not parse comes back as a message', () => {
    expect(readJson('{"a": 1}')).toEqual({ ok: true, value: { a: 1 } })
    const bad = readJson('{"a": }')
    expect(bad.ok).toBe(false)
  })
})

describe('FileTree', () => {
  test('folders come from the paths, and a chain of single folders is one row', () => {
    const tree = buildFileTree([
      { path: 'src/gateway/limiter.ts', change: 'added' },
      { path: 'src/gateway/middleware.ts' },
      { path: 'README.md', change: 'modified' },
    ])
    expect([...tree.dirs.keys()]).toEqual(['src'])
    expect(tree.dirs.get('src')?.name).toBe('src/gateway')
    expect(tree.files.map((file) => file.name)).toEqual(['README.md'])
    expect(tree.dirs.get('src')?.files.map((file) => file.change)).toEqual(['added', 'modified'])
  })

  test('renders tags, counts, notes, renames, and folder toggles', () => {
    const out = html(
      <FileTree title="Files touched">
        <File path="src/a.ts" change="added">
          New file.
        </File>
        <File path="src/b.ts" change="deleted" />
        <File path="docs/new.md" from="docs/old.md" change="renamed" />
      </FileTree>,
    )
    expect(out).toContain('data-doc-block="FileTree"')
    expect(out).toContain('Files touched')
    expect(out).toContain('3 files')
    expect(out).toContain('aria-label="1 added, 1 deleted, 1 renamed"')
    expect(out).toContain('aria-expanded="true"')
    expect(out).toContain('<span aria-hidden="true">NEW</span><span class="plan-sr">Added</span>')
    expect(out).toContain('← docs/old.md')
    expect(out).toContain('New file.')
  })

  test('folders are nested lists the folder button controls, an empty tree says so, and an unknown change shows as written', () => {
    const out = html(
      <FileTree>
        <File path="src/a.ts" change="sideways" />
        <File path="src/b.ts" />
      </FileTree>,
    )
    expect(out).toContain('class="plan-tree-group"')
    expect(out).toMatch(/aria-controls="[^"]+"/)
    expect(out).toContain('data-change="other"')
    expect(out).toContain('SIDEWAYS')
    expect(out).toContain('aria-label="1 modified"')
    expect(html(<FileTree title="None">{null}</FileTree>)).toContain('No files.')
  })

  test('a File on its own reads as a path', () => {
    expect(html(<File path="src/a.ts" change="added" />)).toContain('plan-path-name">src/a.ts')
  })
})

describe('Endpoint, DataModel, JsonView', () => {
  test('an endpoint shows its method, path, summary, params, and responses', () => {
    const out = html(
      <Endpoint method="post" path="/api/keys/{id}" change="added" auth="API key" open>
        <p>Set the limit.</p>
        <Param name="id" in="path" type="string" required>
          Which key.
        </Param>
        <EndpointResponse status="404">Not found.</EndpointResponse>
      </Endpoint>,
    )
    expect(out).toContain('<details class="plan-doc-card plan-endpoint"')
    expect(out).toContain(' open=""')
    expect(out).toContain('data-method="post">POST')
    expect(out).toContain('/api/keys/{id}')
    expect(out).toContain('plan-endpoint-sum">Set the limit.')
    expect(out).toContain('Needs API key')
    expect(out).toContain('(required)')
    expect(out).toContain('data-class="4xx">404')
  })

  test('a data model lists tables, keys, foreign keys, and relations', () => {
    const out = html(
      <DataModel title="Tables">
        <Entity name="rate_limits" change="added">
          <Attr name="key_id" type="text" pk fk="api_keys.id" />
          <Attr name="updated_at" type="timestamptz" nullable />
        </Entity>
        <Relation from="api_keys" to="rate_limits" kind="1-1" />
      </DataModel>,
    )
    expect(out).toContain('1 table')
    expect(out).toContain('2 fields')
    expect(out).toContain('plan-key-chip">PK')
    expect(out).toContain('FK api_keys.id')
    expect(out).toContain(' · null')
    expect(out).toContain('1:1')
  })

  test('JSON folds below its depth, and a bad payload keeps its source and says why', () => {
    const fence = (text: string) => (
      <pre>
        <code className="language-json">{text}</code>
      </pre>
    )
    const out = html(<JsonView title="Body" depth="1">{fence('{"a": {"b": 1}, "c": [1, 2]}')}</JsonView>)
    expect(out).toContain('plan-json-key">&quot;a&quot;')
    expect(out).toContain('… 1 key')
    expect(out).toContain('… 2 items')
    const bad = html(<JsonView>{fence('{"a": }')}</JsonView>)
    expect(bad).toContain('Could not read this JSON')
    expect(bad).toContain('{&quot;a&quot;: }')
  })
})

describe('AnnotatedCode, Tabs, Compare, Update, Properties, Path', () => {
  test('annotated code lists its notes with their lines', () => {
    const out = html(
      <AnnotatedCode title="gate.ts" start="40">
        <pre>
          <code className="language-ts">{'a\nb\nc\n'}</code>
        </pre>
        <Note lines="41-42" label="Why">
          Because.
        </Note>
      </AnnotatedCode>,
    )
    expect(out).toContain('gate.ts')
    expect(out).toContain('L41–42')
    expect(out).toContain('<b>Why.</b>')
    expect(out).toContain('data-source="a\nb\nc"')
  })

  test('annotated code reads start= from the fence and flags notes outside it', () => {
    const out = html(
      <AnnotatedCode>
        <pre>
          <code className="language-ts" data-meta="start=40">{'a\nb\n'}</code>
        </pre>
        <Note lines="99">Too far.</Note>
      </AnnotatedCode>,
    )
    expect(out).toContain('These lines are not in this code.')
    expect(fenceStartLine('start=40')).toBe(40)
    expect(fenceStartLine('title=x start=7')).toBe(7)
    expect(fenceStartLine('start=0')).toBeUndefined()
    expect(fenceStartLine(undefined)).toBeUndefined()
  })

  test('tabs are WAI-ARIA tabs, and hidden panels can still be found', () => {
    const out = html(
      <Tabs label="Files">
        <Tab label="one">First</Tab>
        <Tab label="two">Second</Tab>
      </Tabs>,
    )
    expect(out).toContain('role="tablist"')
    expect(out).toContain('aria-label="Files"')
    expect(out.match(/role="tab"/g)?.length).toBe(2)
    expect(out).toContain('aria-selected="true"')
    expect(out).toContain('data-tab-state="hidden"')
    // Only the shown panel is in the tab order.
    expect(out.match(/role="tabpanel"[^>]*tabindex="0"/g)?.length).toBe(1)
  })

  test('compare, update, properties, and path', () => {
    expect(
      html(
        <Compare>
          <Pane label="Before">A</Pane>
          <Pane label="After">B</Pane>
        </Compare>,
      ),
    ).toContain('data-panes="2"')
    const update = html(
      <Update health="at-risk" by="Agent" date="2026-11-13">
        Late.
      </Update>,
    )
    expect(update).toContain('data-health="at-risk"')
    expect(update).toContain('At risk')
    expect(update).toContain('dateTime="2026-11-13"')
    const props = html(
      <Properties>
        <Prop label="Owner">Gateway</Prop>
      </Properties>,
    )
    expect(props).toContain('<dl class="plan-properties"')
    expect(props).toContain('<dt>Owner</dt><dd>Gateway</dd>')
    const path = html(
      <Path change="modified" lines="42-58">
        src/gate.ts
      </Path>,
    )
    expect(path).toContain('MODIFY')
    expect(path).toContain('src/gate.ts')
    expect(path).toContain('L42–58')
  })

  test('a locked block is marked so the page shows no Edit on it', () => {
    expect(html(<FileTree locked>{null}</FileTree>)).toContain('data-edit-locked="true"')
    expect(html(<FileTree>{null}</FileTree>)).not.toContain('data-edit-locked')
  })
})

describe('checklist states', () => {
  test('status wins over done, and done alone still works', () => {
    expect(checkState(undefined, true)).toBe('done')
    expect(checkState(undefined, 'true')).toBe('done')
    expect(checkState(undefined, false)).toBe('todo')
    expect(checkState('active', true)).toBe('active')
    expect(checkState('blocked', undefined)).toBe('blocked')
    expect(checkState('failed', undefined)).toBe('failed')
    expect(checkState('pending', true)).toBe('todo')
  })

  test('a checklist counts done lines and draws one bar segment per line', () => {
    const out = renderToStaticMarkup(
      <Checklist title="Done when">
        <Item done>One</Item>
        <Item status="active">Two</Item>
        <Item>Three</Item>
      </Checklist>,
    )
    expect(out).toContain('1 of 3 done')
    expect(out.match(/<i data-state=/g)?.length).toBe(3)
    expect(out).toContain('data-state="active"')
    const active = renderToStaticMarkup(
      <ItemContext.Provider value={{ mode: 'checklist', disabled: true }}>
        <Item status="active">Two</Item>
      </ItemContext.Provider>,
    )
    expect(active).toContain('class="plan-check-name">In progress<')
  })

  test('the outline keeps an item status for search and the contents', () => {
    const outline = buildMdxOutline('<checklist id="c" title="T">\n<item status="active">A</item>\n<item done="true">B</item>\n</checklist>\n')
    const block = outline.blocks[0]
    expect(block?.type).toBe('checklist')
    if (block?.type !== 'checklist') return
    expect(block.items).toEqual([
      { text: 'A', done: false, status: 'active' },
      { text: 'B', done: true },
    ])
  })
})

describe('locking a block', () => {
  test('the page reads `locked`, and answer cards default to locked', () => {
    expect(editLocked(true)).toBe(true)
    expect(editLocked('')).toBe(true)
    expect(editLocked('true')).toBe(true)
    expect(editLocked(undefined)).toBe(false)
    expect(editLocked(undefined, true)).toBe(true)
    expect(editLocked('false', true)).toBe(false)
  })

  test('a card that holds a locked card cannot be removed, and a lockable block marks its lock', () => {
    const attribute = [{ type: 'mdxJsxAttribute', name: 'locked', value: null }]
    const phase = {
      type: 'mdxJsxFlowElement',
      name: 'phase',
      attributes: [],
      children: [{ type: 'paragraph', children: [] }, { type: 'mdxJsxFlowElement', name: 'FileTree', attributes: attribute, children: [] }],
    }
    expect(containsLocked(phase)).toBe(true)
    expect(containsLocked({ ...phase, children: [] })).toBe(false)
    expect(isLockedNodeDeep({ getMdastNode: () => phase })).toBe(true)
    expect(isLockedNodeDeep({ getMdastNode: () => ({ ...phase, children: [] }) })).toBe(false)
    const Box = lockable((props: { children?: React.ReactNode }) => <div className="box">{props.children}</div>)
    expect(html(<Box locked>x</Box>)).toBe('<div class="plan-edit-lock" data-edit-locked="true"><div class="box">x</div></div>')
    expect(html(<Box>x</Box>)).toBe('<div class="box">x</div>')
  })

  test('the editor reads `locked` on any tag, and `locked="false"` unlocks an answer card', () => {
    const attribute = (value: unknown) => [{ type: 'mdxJsxAttribute', name: 'locked', value }]
    expect(lockedAttribute({ name: 'callout', attributes: attribute(null) })).toBe(true)
    expect(isLockedMdast({ name: 'callout', attributes: attribute(null) })).toBe(true)
    expect(isLockedMdast({ name: 'FileTree', attributes: attribute('true') })).toBe(true)
    expect(isLockedMdast({ name: 'callout', attributes: [] })).toBe(false)
    expect(isLockedMdast({ name: 'questions', attributes: [] })).toBe(true)
    expect(isLockedMdast({ name: 'plan-form', attributes: attribute('false') })).toBe(false)
    expect(isLockedMdast({ name: 'phase', attributes: attribute({ type: 'mdxJsxAttributeValueExpression', value: 'true' }) })).toBe(true)
  })
})

describe('plan header', () => {
  const source = `---
title: T
agent: local-claude
mode: watch
---

# T

<phase id="a" title="First" status="done">
A
</phase>

<phase id="b" title="Second" status="active">
B
</phase>

<choice id="c" prompt="Pick">
<option id="x" label="X">X</option>
</choice>

<workflow id="w">
\`\`\`workflow
a | First | a
b | Second | b
--
a -> b
\`\`\`
</workflow>
`

  test('the eyebrow names the mode and agent, and the facts count phases and open questions', () => {
    const info = planHeaderInfo(source, new Set(), 'review')
    expect(info.eyebrow).toBe('Living plan · Review · local-claude')
    expect(info.facts.map((fact) => `${fact.before ?? ''} ${fact.strong} ${fact.text}`.trim())).toEqual([
      'Phase 2 of 2 · Second',
      '1/2 phases done',
      '1 open question',
    ])
    expect(planHeaderInfo(source, new Set(['c'])).facts.at(-1)?.text).toBe('questions answered')
  })
})

describe('fence meta', () => {
  test('a fence keeps its meta on the rendered code, so start= numbers its lines', async () => {
    const compiled = String(await compilePlanMdx('```ts start=40\nconst a = 1\n```\n'))
    expect(compiled).toContain('"data-meta": "start=40"')
  })
})

describe('plans that use document blocks', () => {
  test('the component tour parses, and its block text reaches the outline', () => {
    const source = readFileSync(new URL('../examples/component-tour.plan.md', import.meta.url), 'utf8')
    const plan = parsePlan(source, 'component-tour.plan.md')
    const text = plan.blocks.map((block) => block.source).join('\n')
    expect(text).toContain('Token bucket per API key.')
    expect(plan.entries.filter((entry) => entry.type === 'phase').length).toBe(3)
    const markdown = plan.blocks.flatMap((block) => (block.type === 'markdown' ? [block.html] : []))
    expect(markdown.join('\n')).not.toContain('&lt;FileTree')
  })

  test('the component showcase parses and uses every document block', () => {
    const source = readFileSync(new URL('../examples/component-showcase.plan.md', import.meta.url), 'utf8')
    const plan = parsePlan(source, 'component-showcase.plan.md')
    expect(plan.entries.filter((entry) => entry.type === 'phase').map((entry) => (entry.type === 'phase' ? entry.status : ''))).toEqual([
      'done',
      'done',
      'active',
      'pending',
      'blocked',
      'failed',
    ])
    for (const name of DOC_BLOCK_NAMES) expect(source).toContain(`<${name}`)
    for (const name of ['DataTable', 'BarChart', 'LineChart', 'Box', 'HStack', 'ResponsiveStack', 'Chip', 'Pill']) expect(source).toContain(`<${name}`)
  })

  test('every document block is known to the outline', () => {
    const outline = readFileSync(new URL('../src/planMdx/outline.ts', import.meta.url), 'utf8')
    for (const name of DOC_BLOCK_NAMES) expect(outline).toContain(`'${name}'`)
  })
})
