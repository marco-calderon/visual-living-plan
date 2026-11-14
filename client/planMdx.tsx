import { run } from '@mdx-js/mdx'
import { Children, Fragment, Suspense, cloneElement, createContext, isValidElement, lazy, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type ReactElement, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import * as runtime from 'react/jsx-runtime'
import { fileVersionName, fileVersionSeq, fileVersionText } from '../src/fileVersion.ts'
import type { PlanSnapshotRecord } from '../src/planSnapshots.ts'
import { planSourceToMdx } from '../src/planMdx/source.ts'
import { buildPlanToc, renderTocItemsHtml } from '../src/planToc.ts'
import type { InteractionResponse } from '../src/types.ts'
import { planComponents, preloadPlanComponents } from './planComponents.tsx'
import { editLockAttr } from './entries/planEntry.ts'
import { planHeaderInfo, type PlanHeaderInfo } from './planHeader.ts'
import { fenceStartLine } from '../src/planMdx/remarkCodeMeta.ts'
import { compilePlanMdx } from '../src/planMdx/compilePlanMdx.ts'
import { planHasDataTable } from './mdx/dataTable/detect.ts'
import { MarkdownTable } from './mdx/MarkdownTable.tsx'
import { MarkdownTaskCheckbox } from './mdx/MarkdownTaskCheckbox.tsx'
import { Approve } from './entries/Approve.tsx'
import { Callout } from './entries/Callout.tsx'
import { Checklist } from './entries/Checklist.tsx'
import { Choice } from './entries/Choice.tsx'
import { Form } from './entries/Form.tsx'
import { Phase } from './entries/Phase.tsx'
import { Questions } from './entries/Questions.tsx'
import './entries/primitives.css'
import { subscribePlanEvents } from './planEvents.ts'
import { currentOfflineHandle, planContext, startOfflineEngine } from './offline/engine.ts'
import { stampPlanParts } from './stampPlanParts.ts'
import { markChangedBlocks, readBlockSignatures, restoreScrollAnchor, scrollAnchor, type BlockSignatures, type ScrollAnchor } from './liveUpdate.ts'
import { viewingPlanVersion } from './versionView.ts'
import { sendPlanMutation, sharedQueryClient } from './queryClient.tsx'
import { clearDraft, isLegacyDraft, readDraft, writeDraft, type PlanDraft } from './editor/draftStore.ts'
import { planNotReadyReason } from '../src/planReady.ts'
import type { DraftConflict, DraftSide } from '../src/planMdx/rebaseDraft.ts'
import { bindBlockEditButton, type BlockEditBinding, type EditCaret, type EditHow } from './planEditButton.ts'
import { bindBlockMove, type BlockMoveBinding, type BlockMoved } from './planBlockMove.ts'
import { CELL_RANGE_ATTR, moveBlock, parseBlockRange, parseCellRange, type BlockPlace } from '../src/planMdx/remarkBlockRanges.ts'
import { Button } from './ui/button.tsx'
import type { BlockTarget } from './editor/BlockEditor.tsx'

type PlanWindow = Window & {
  __LIVE_PLAN_BASE__?: string
}

type Boot = {
  source: string
  title: string
  responses: Record<string, InteractionResponse>
  locked: boolean
  snapshots: PlanSnapshotRecord[]
  headSnapshotId: string | null
}

type PlanModule = ComponentType<{ components: typeof planComponents }>

const compiled = new Map<string, Promise<PlanModule>>()

function apiPath(path: string): string {
  const base = (window as PlanWindow).__LIVE_PLAN_BASE__ ?? ''
  return `${base}${path}`
}

function readBoot(): Boot {
  const node = document.getElementById('living-plan-mdx')
  const empty: Boot = { source: '', title: '', responses: {}, locked: false, snapshots: [], headSnapshotId: null }
  if (!node?.textContent) return empty
  try {
    const parsed = JSON.parse(node.textContent) as Partial<Boot>
    return {
      source: typeof parsed.source === 'string' ? parsed.source : '',
      title: typeof parsed.title === 'string' ? parsed.title : '',
      responses: parsed.responses ?? {},
      locked: Boolean(parsed.locked),
      snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [],
      headSnapshotId: typeof parsed.headSnapshotId === 'string' ? parsed.headSnapshotId : null,
    }
  } catch {
    return empty
  }
}

function compileMdx(source: string): Promise<PlanModule> {
  const cached = compiled.get(source)
  if (cached) return cached
  const pending = compilePlanMdx(source).then(async (file) => {
    const loaded = await run(String(file), { ...runtime })
    return loaded.default as PlanModule
  })
  compiled.set(source, pending)
  pending.catch(() => {
    if (compiled.get(source) === pending) compiled.delete(source)
  })
  return pending
}

async function postInteraction(response: InteractionResponse): Promise<void> {
  // A static import: a lazy chunk is only fetched on the first answer, so it is missing from the shell cache when that answer is made offline.
  const result = await sendPlanMutation('interaction', apiPath(`/api/interactions/${encodeURIComponent(response.id)}`), response)
  if (!result.ok && !result.queued) throw new Error(result.text || 'Could not send')
}

function blockClass(className?: string): string {
  return [className, 'block'].filter(Boolean).join(' ')
}

type TocCursor = { n: number; ids: string[] }

const TocHeadingCursor = createContext<{ current: TocCursor } | null>(null)

/** The plan header's eyebrow and facts (client/planHeader.ts), for the plan's first heading. */
const PlanHeaderContext = createContext<PlanHeaderInfo | null>(null)

/** The plan's first heading, with the eyebrow above it and the fact chips under it (ADR 0039). */
function PlanTitleHeading({ id, blockRange, children, editing }: { id?: string; blockRange?: string; children?: ReactNode; editing?: boolean }) {
  const info = useContext(PlanHeaderContext)
  const heading = (
    <h1 id={id} data-plan-block={blockRange}>
      {children}
    </h1>
  )
  return (
    <>
      {info?.eyebrow ? (
        <p className="plan-head-eyebrow" data-plan-head="">
          {info.eyebrow}
        </p>
      ) : null}
      {/* The title edited as it reads keeps the eyebrow above it and the facts under it. */}
      {editing ? <BlockEditSlot replaced={null} fallback={heading} /> : heading}
      {info && info.facts.length > 0 ? (
        <ul className="plan-head-facts" data-plan-head="" aria-label="Plan progress">
          {info.facts.map((fact) => (
            <li key={fact.key} className="plan-head-fact" title={fact.title}>
              {fact.before ? `${fact.before} ` : null}
              <b>{fact.strong}</b> {fact.text}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  )
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online
}

/** The page's mode (watch, review, a run). The toolbar changes it without a render. */
function useBodyMode(): string | undefined {
  const [mode, setMode] = useState(() => document.body.dataset.planMode)
  useEffect(() => {
    const observer = new MutationObserver(() => setMode(document.body.dataset.planMode))
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-plan-mode'] })
    return () => observer.disconnect()
  }, [])
  return mode
}

type PlanHeadingProps = { children?: ReactNode; 'data-plan-block'?: string; 'data-plan-editing'?: boolean }

function PlanMarkdownHeading({ level, children, 'data-plan-block': blockRange, 'data-plan-editing': editing }: PlanHeadingProps & { level: 1 | 2 | 3 }) {
  const cursor = useContext(TocHeadingCursor)
  let id: string | undefined
  // The plan's opening heading: the first heading of the document, when it is a `#` heading.
  const first = cursor ? cursor.current.n === 0 : false
  if (cursor) {
    id = cursor.current.ids[cursor.current.n]
    cursor.current.n += 1
  }
  if (level === 1 && first) return <PlanTitleHeading id={id} blockRange={blockRange} editing={editing}>{children}</PlanTitleHeading>
  const heading =
    level === 1 ? <h1 id={id} data-plan-block={blockRange}>{children}</h1>
    : level === 2 ? <h2 id={id} data-plan-block={blockRange}>{children}</h2>
    : <h3 id={id} data-plan-block={blockRange}>{children}</h3>
  // A heading open in the editor keeps its place in the contents, so the headings after it keep their ids.
  return editing ? <BlockEditSlot replaced={null} fallback={heading} /> : heading
}

function PlanH1(props: PlanHeadingProps) {
  return <PlanMarkdownHeading level={1} {...props} />
}

function PlanH2(props: PlanHeadingProps) {
  return <PlanMarkdownHeading level={2} {...props} />
}

function PlanH3(props: PlanHeadingProps) {
  return <PlanMarkdownHeading level={3} {...props} />
}

const loadBlockEditor = () => import('./editor/BlockEditor.tsx')
const LazyBlockEditor = lazy(() => loadBlockEditor().then((module) => ({ default: module.BlockEditor })))

/** True when two plan files differ only in the spacing at their ends. */
function samePlanSource(a: string, b: string): boolean {
  return a.trimEnd() === b.trimEnd()
}

/** A block editor open on the page (ADR 0040): what it edits, and the plan file the page showed when it opened. */
type OpenEdit = {
  id: number
  /**
   * `data-plan-block` of the block to edit (`inline` for text, edited as it reads), of the block to
   * add after (null: after the last), or `data-plan-cell-range` of a pipe table cell.
   */
  target: { kind: 'edit'; range: string; inline?: boolean } | { kind: 'add'; after: string | null } | { kind: 'cell'; range: string }
  /** Where the caret goes, and the margins inline text keeps. */
  caret?: EditCaret
  margins?: EditHow['margins']
  source: string
  /** The plan file Done kept. The editor closes when the page shows it. */
  committed?: string
}

type EditSlot = {
  open: OpenEdit
  commit: (next: string) => Promise<string | null>
  cancel: () => void
}

/** The open block editor, for the plan body to draw in the block's place. */
const EditSlotContext = createContext<EditSlot | null>(null)

function blockTarget(open: OpenEdit): BlockTarget | null {
  if (open.target.kind === 'edit') {
    const range = parseBlockRange(open.target.range)
    return range ? { kind: 'edit', range, inline: open.target.inline } : null
  }
  if (open.target.kind === 'cell') {
    const range = parseCellRange(open.target.range)
    return range ? { kind: 'cell', range } : null
  }
  if (open.target.after === null) return { kind: 'add', after: null }
  const after = parseBlockRange(open.target.after)
  return after ? { kind: 'add', after } : null
}

type SaveResult = { ok: true } | { ok: false; message: string; status?: number }

/** Publish an edit. The same route on the local service and on the host, where it also saves a version. */
async function saveEditedSource(base: string, source: string): Promise<SaveResult & { payload?: Partial<Boot> }> {
  let response: Response
  try {
    response = await fetch(apiPath('/api/plan-mdx/source'), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ base, source }),
    })
  } catch {
    return { ok: false, message: 'Could not reach the plan. The draft is still on this device; publish again when you are back online.' }
  }
  if (response.ok) return { ok: true, payload: (await response.json()) as Partial<Boot> }
  const text = await response.text().catch(() => '')
  let message = text
  try {
    const parsed = JSON.parse(text) as { error?: unknown; message?: unknown }
    message = String(parsed.error ?? parsed.message ?? text)
  } catch {
    // Plain text error.
  }
  return { ok: false, message: message || `Could not save the plan (${response.status})`, status: response.status }
}

const loadRebase = () => import('../src/planMdx/rebaseDraft.ts')

/**
 * The person's changes on the plan the agent wrote since (src/planMdx/rebaseDraft.ts), as a draft
 * on `theirs`. Null when the merge does not render (`planNotReadyReason`); the draft stays as it was.
 */
async function rebasedDraft(draft: PlanDraft, theirs: string, keep: Record<string, DraftSide>): Promise<PlanDraft | null> {
  const from = draft.rebase ?? { base: draft.base, mine: draft.source }
  try {
    const { rebaseDraft } = await loadRebase()
    const result = rebaseDraft({ base: from.base, mine: from.mine, theirs, keep })
    if (await planNotReadyReason(result.source)) return null
    const next: PlanDraft = { base: theirs, source: result.source, edits: draft.edits, savedAt: draft.savedAt }
    if (result.conflicts.length === 0) return next
    return { ...next, rebase: { base: from.base, mine: from.mine, keep, conflicts: result.conflicts } }
  } catch {
    return null
  }
}

/** What the Apply bar says about one overlapping block, under its name. */
function conflictDetail(conflict: DraftConflict): string {
  if (!conflict.mine) return 'You removed it. The agent changed it.'
  if (!conflict.theirs) return `The agent removed it. Yours: ${conflict.minePreview}`
  return `Yours: ${conflict.minePreview}`
}

const LazyCodeBlock = lazy(() => import('./CodeBlock.tsx').then((module) => ({ default: module.CodeBlock })))

/**
 * Code renders through React, so a live edit updates it in place. A DOM swap outside React would
 * leave React holding a detached node that later edits and removals cannot reach.
 */
function PlanPre({ children }: { children?: ReactNode }) {
  const child = Children.toArray(children).find((node) => isValidElement<{ className?: string; children?: ReactNode }>(node))
  const className = child && isValidElement<{ className?: string }>(child) ? (child.props.className ?? '') : ''
  // `start=40` after the fence's language (src/planMdx/remarkCodeMeta.ts).
  const start = child && isValidElement<{ 'data-meta'?: string }>(child) ? fenceStartLine(child.props['data-meta']) : undefined
  // The fence's place in the plan file, for editing it in place (src/planMdx/remarkBlockRanges.ts).
  const blockRange = child && isValidElement<{ 'data-plan-block'?: string }>(child) ? child.props['data-plan-block'] : undefined
  const lang = /language-([\w+-]+)/.exec(className)?.[1] ?? ''
  const diff = lang === 'diff' || lang === 'patch'
  const body = child && isValidElement<{ children?: ReactNode }>(child) ? child.props.children : children
  const code = textOf(body).replace(/\n$/, '')
  const plain = (
    <pre className="code-block" data-react-code="" data-lang={lang && !diff ? lang : undefined} data-diff={diff ? 'true' : undefined}>
      <code>{code}</code>
    </pre>
  )
  return (
    <div className="code-host" data-react-code="" data-source={code} data-plan-block={blockRange}>
      <Suspense fallback={plain}>
        <LazyCodeBlock code={code} language={diff ? '' : lang} diff={diff} startingLineNumber={diff ? undefined : start} />
      </Suspense>
    </div>
  )
}

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children)
  return ''
}

type PlanBodyProps = { Content: PlanModule; components: typeof planComponents; source: string }

/**
 * One component type for every version of the plan. The compiled function is called here rather
 * than mounted, so React compares the new blocks with the ones on the page and keeps what did not
 * change. Mounting a new compiled component would replace the whole document on each edit.
 */
function PlanBody({ Content, components, source }: PlanBodyProps) {
  const slot = useContext(EditSlotContext)
  const tree = (Content as (props: { components: typeof planComponents }) => ReactNode)({ components })
  const blocks = keyedBlocks(tree)
  // The editor's range is a place in the file it opened on. A newer file has other places.
  if (!slot || slot.open.source !== source || slot.open.committed !== undefined) return <>{blocks}</>
  return <>{placeEditSlot(blocks, slot.open)}</>
}

/** The block's place in the plan file: its own `data-plan-block`, or a fence's on its `<code>`. */
function rangeOfElement(element: ReactElement): string | undefined {
  const props = element.props as { 'data-plan-block'?: unknown; children?: ReactNode }
  if (typeof props['data-plan-block'] === 'string') return props['data-plan-block']
  if (element.type !== PlanPre) return undefined
  const code = Children.toArray(props.children).find((node) => isValidElement(node))
  const inner = code && isValidElement<{ 'data-plan-block'?: unknown }>(code) ? code.props['data-plan-block'] : undefined
  return typeof inner === 'string' ? inner : undefined
}

const PLAN_HEADINGS = new Set<unknown>([PlanH1, PlanH2, PlanH3])

/** Headings inside a block. The editor takes the block's place, so the headings after it keep their ids. */
function countHeadings(node: ReactNode): number {
  if (Array.isArray(node)) return node.reduce<number>((sum, child) => sum + countHeadings(child as ReactNode), 0)
  if (!isValidElement<{ children?: ReactNode }>(node)) return 0
  return (PLAN_HEADINGS.has(node.type) ? 1 : 0) + countHeadings(node.props.children)
}

function BlockEditSlot({ replaced, fallback }: { replaced: ReactElement | null; fallback?: ReactNode }) {
  const slot = useContext(EditSlotContext)
  const cursor = useContext(TocHeadingCursor)
  if (cursor && replaced) cursor.current.n += countHeadings(replaced)
  const target = slot ? blockTarget(slot.open) : null
  if (!slot || !target) return fallback ?? replaced
  // Text edited as it reads stays as it is while the editor's code loads, so nothing flickers.
  const inline = target.kind === 'cell' || (target.kind === 'edit' && target.inline === true)
  return (
    <Suspense
      fallback={
        inline ? (
          (fallback ?? replaced)
        ) : (
          <div className="plan-block-editor-loading" data-plan-block-editor="loading" role="status">
            Opening the editor…
          </div>
        )
      }
    >
      <LazyBlockEditor
        key={slot.open.id}
        source={slot.open.source}
        target={target}
        commit={slot.commit}
        onCancel={slot.cancel}
        caret={slot.open.caret}
        margins={slot.open.margins}
      />
    </Suspense>
  )
}

/**
 * Put the open block editor in the tree: in the block's place, or after the block it adds to.
 * Only the elements on the way to the block are copied, so every other block keeps its state.
 */
function placeEditSlot(blocks: ReactNode, open: OpenEdit): ReactNode {
  const slot = (replaced: ReactElement | null, key: string) => <BlockEditSlot key={key} replaced={replaced} />
  if (open.target.kind === 'add' && open.target.after === null) {
    return [...(Array.isArray(blocks) ? blocks : [blocks]), slot(null, 'plan-block-new')]
  }
  const placed = placeIn(blocks, open, slot)
  return placed ?? blocks
}

function placeIn(
  children: ReactNode,
  open: OpenEdit,
  slot: (replaced: ReactElement | null, key: string) => ReactElement,
): ReactNode | null {
  const list = Array.isArray(children) ? (children as ReactNode[]) : [children]
  for (const [index, node] of list.entries()) {
    if (Array.isArray(node)) {
      const inner = placeIn(node, open, slot)
      if (inner === null) continue
      const next = [...list]
      next[index] = inner
      return Array.isArray(children) ? next : next[0]
    }
    if (!isValidElement(node)) continue
    // A pipe table cell keeps its own box; the editor goes in it, in place of its text.
    if (open.target.kind === 'cell' && (node.props as Record<string, unknown>)[CELL_RANGE_ATTR] === open.target.range) {
      const cellProps = node.props as { children?: ReactNode }
      const next = [...list]
      next[index] = cloneElement(node as ReactElement<{ children?: ReactNode }>, {
        children: <BlockEditSlot key="plan-cell-edit" replaced={null} fallback={cellProps.children} />,
      })
      return Array.isArray(children) ? next : next[0]
    }
    const range = rangeOfElement(node)
    if (range !== undefined && open.target.kind === 'edit' && range === open.target.range) {
      const next = [...list]
      // A heading draws the editor itself, in its own place: the title keeps its eyebrow and facts.
      next[index] = PLAN_HEADINGS.has(node.type)
        ? cloneElement(node as ReactElement<PlanHeadingProps>, { 'data-plan-editing': true })
        : slot(node, node.key ?? `plan-block-edit-${index}`)
      return Array.isArray(children) ? next : next[0]
    }
    if (range !== undefined && open.target.kind === 'add' && range === open.target.after) {
      const next = [...list]
      // Keyed siblings take a new one in between. Unkeyed ones would all shift, so the block and its new neighbour share a slot.
      if (node.key !== null) next.splice(index + 1, 0, slot(null, 'plan-block-new'))
      else next[index] = <Fragment key={`plan-block-add-${index}`}>{node}{slot(null, 'plan-block-new')}</Fragment>
      return Array.isArray(children) ? next : next.length === 1 ? next[0] : next
    }
    const inner = (node.props as { children?: ReactNode }).children
    if (inner === undefined || inner === null || typeof inner !== 'object') continue
    const placed = placeIn(inner, open, slot)
    if (placed === null) continue
    const next = [...list]
    next[index] = cloneElement(node as ReactElement<{ children?: ReactNode }>, { children: placed })
    return Array.isArray(children) ? next : next[0]
  }
  return null
}

/** Key top-level blocks by their id, or by kind and position, so an insert does not shift every block after it. */
function keyedBlocks(tree: ReactNode): ReactNode {
  const top = isValidElement<{ children?: ReactNode }>(tree) && tree.type === Symbol.for('react.fragment') ? tree.props.children : tree
  const seen = new Map<string, number>()
  return Children.map(top, (node) => {
    if (!isValidElement(node)) return node
    const element = node as ReactElement<{ id?: unknown }>
    const type = typeof element.type === 'string' ? element.type : (element.type as { name?: string }).name || 'block'
    const id = typeof element.props.id === 'string' ? element.props.id : ''
    const base = id ? `${type}:${id}` : type
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return cloneElement(element, { key: n === 1 && id ? base : `${base}#${n}` })
  })
}

type InteractionState = { responses: Boot['responses']; locked: boolean }

// Answers and the lock reach the entries through context. The component functions stay the same
// between renders, so a new answer re-renders the forms in place instead of remounting the plan.
const InteractionContext = createContext<InteractionState>({ responses: {}, locked: false })

function stopBubble(event: { stopPropagation: () => void }) {
  event.stopPropagation()
}

function sendInteraction(response: InteractionResponse) {
  void postInteraction(response)
}

function PlanChoice(props: { className?: string; id: string; locked?: unknown; 'data-plan-block'?: string }) {
  const { responses, locked } = useContext(InteractionContext)
  const saved = responses[props.id]
  return (
    <div onClick={stopBubble} onSubmit={stopBubble} data-edit-locked={editLockAttr(props.locked, false)} data-plan-block={props['data-plan-block']}>
      <Choice
        {...props}
        className={blockClass(props.className)}
        locked={locked}
        selectedId={saved?.kind === 'choice' ? saved.optionId : undefined}
        selectedLabel={saved?.kind === 'choice' ? saved.label : undefined}
        onSelect={sendInteraction}
      />
    </div>
  )
}

function PlanForm(props: { className?: string; id: string; locked?: unknown; 'data-plan-block'?: string }) {
  const { responses, locked } = useContext(InteractionContext)
  const saved = responses[props.id]
  return (
    <div onClick={stopBubble} onSubmit={stopBubble} data-edit-locked={editLockAttr(props.locked, true)} data-plan-block={props['data-plan-block']}>
      <Form
        {...props}
        className={blockClass(props.className)}
        locked={locked}
        values={saved?.kind === 'form' ? saved.values : undefined}
        onSubmit={sendInteraction}
      />
    </div>
  )
}

function PlanQuestions(props: { className?: string; id: string; locked?: unknown; 'data-plan-block'?: string }) {
  const { responses, locked } = useContext(InteractionContext)
  const saved = responses[props.id]
  return (
    <div onClick={stopBubble} onSubmit={stopBubble} data-edit-locked={editLockAttr(props.locked, true)} data-plan-block={props['data-plan-block']}>
      <Questions
        {...props}
        className={blockClass(props.className)}
        locked={locked}
        answers={saved?.kind === 'questions' ? saved.answers : undefined}
        onSubmit={sendInteraction}
      />
    </div>
  )
}

function PlanApprove(props: { className?: string; id: string; locked?: unknown; 'data-plan-block'?: string }) {
  const { responses, locked } = useContext(InteractionContext)
  const saved = responses[props.id]
  return (
    <div onClick={stopBubble} onSubmit={stopBubble} data-edit-locked={editLockAttr(props.locked, false)} data-plan-block={props['data-plan-block']}>
      <Approve
        {...props}
        className={blockClass(props.className)}
        locked={locked}
        approved={saved?.kind === 'approve' ? saved.approved : undefined}
        note={saved?.kind === 'approve' ? saved.note : undefined}
        onDecide={sendInteraction}
      />
    </div>
  )
}

const interactiveComponents = {
  choice: PlanChoice,
  form: PlanForm,
  questions: PlanQuestions,
  approve: PlanApprove,
}

function PlanPhase(props: { className?: string; locked?: unknown }) {
  return <Phase {...props} className={blockClass(props.className)} />
}

function PlanCallout(props: { className?: string }) {
  return <Callout {...props} className={blockClass(props.className)} />
}

function PlanChecklist(props: { className?: string }) {
  return <Checklist {...props} className={blockClass(props.className)} />
}

// The last plan source this device rendered, per plan. A bad edit from the agent mid-run then
// leaves the plan readable, and a reload still has something to show.
function lastRenderedKey(): string {
  return `living-plan:last-rendered:${planContext().id}`
}

function readLastRendered(): string | null {
  try {
    return window.localStorage.getItem(lastRenderedKey())
  } catch {
    return null
  }
}

function rememberLastRendered(source: string): void {
  // A saved version is not the live plan.
  if (viewingPlanVersion() !== null) return
  try {
    window.localStorage.setItem(lastRenderedKey(), source)
  } catch {
    // Storage is full or blocked. The page still shows the plan.
  }
}

const CLOUD_VERSION_TRIES = 5

/**
 * Sources to show when the live plan does not compile, newest first: the last one this device
 * rendered, then saved versions (snapshots on a local plan, published versions on a cloud plan).
 */
async function* fallbackSources(boot: Boot): AsyncGenerator<string> {
  const seen = new Set<string>([boot.source])
  const fresh = (source: string | null | undefined): source is string => {
    if (!source || seen.has(source)) return false
    seen.add(source)
    return true
  }
  const last = readLastRendered()
  if (fresh(last)) yield last
  for (const snapshot of [...boot.snapshots].sort((a, b) => b.seq - a.seq)) {
    if (fresh(snapshot.body)) yield snapshot.body
  }
  const context = planContext()
  if (context.host !== 'cloud') return
  const listed = await fetch(`/api/plans/${encodeURIComponent(context.id)}/versions`, { cache: 'no-store', credentials: 'include' })
    .then((response) => (response.ok ? (response.json() as Promise<{ versions?: Array<{ seq: number }> }>) : null))
    .catch(() => null)
  const seqs = (listed?.versions ?? []).map((version) => version.seq).sort((a, b) => b - a).slice(0, CLOUD_VERSION_TRIES)
  for (const seq of seqs) {
    const source = await fetch(`/plans/${encodeURIComponent(context.id)}/versions/${seq}/document`, { cache: 'no-store', credentials: 'include' })
      .then((response) => (response.ok ? response.text() : null))
      .catch(() => null)
    if (fresh(source)) yield source
  }
}

async function readPlanMdx(): Promise<Boot> {
  const response = await fetch(apiPath('/api/plan-mdx'), { cache: 'no-store' })
  if (!response.ok) throw new Error('Request failed')
  return (await response.json()) as Boot
}

/** Read the live plan again: through the device store when it runs, else from the plan. */
async function refreshLivePlan(apply: (payload: Boot) => void): Promise<void> {
  const engine = await startOfflineEngine()
  if (engine?.available) {
    await engine.syncPlan()
    return
  }
  const payload = await sharedQueryClient()
    .fetchQuery({ queryKey: ['plan-mdx', apiPath('')], queryFn: readPlanMdx, staleTime: 0 })
    .catch(() => null)
  if (payload && typeof payload.source === 'string') apply(payload)
}

function PlanMdxApp() {
  const [boot, setBoot] = useState<Boot>(readBoot)
  const [content, setContent] = useState<ReactNode>(null)
  const pendingAnchor = useRef<ScrollAnchor | null>(null)
  const signatures = useRef<BlockSignatures | null>(null)
  const [error, setError] = useState<string | null>(null)
  const planId = planContext().id
  // A local plan, or a hosted plan this account owns. A saved version is read-only.
  const canEdit =
    viewingPlanVersion() === null && (planContext().host === 'local' || document.body.dataset.planOwner === 'true')
  // Block edits not applied yet (ADR 0040). The page shows them; Apply changes publishes them as a version.
  const [draft, setDraft] = useState<PlanDraft | null>(() => {
    const stored = canEdit ? readDraft(planId) : null
    return stored && !isLegacyDraft(stored) ? stored : null
  })
  // The block editor on the page, if one is open.
  const [openEdit, setOpenEdit] = useState<OpenEdit | null>(null)
  const editIds = useRef(0)
  const editBinding = useRef<BlockEditBinding | null>(null)
  // The plan file the page draws: the unapplied changes, else the file a block editor opened on, else the live plan.
  const pageSource = draft?.source ?? openEdit?.source ?? boot.source
  // The source on screen. It lags `pageSource` when the newest source does not compile.
  const [shownSource, setShownSource] = useState<string>(pageSource)
  const stale = shownSource !== pageSource
  const contentRef = useRef<ReactNode>(null)
  contentRef.current = content
  const mdx = planSourceToMdx(pageSource)
  const responses = boot.responses
  const locked = boot.locked
  const interaction = useMemo<InteractionState>(() => ({ responses, locked }), [responses, locked])
  const headingIds = useMemo(() => {
    try {
      return buildPlanToc(shownSource).flatMap((item) => (item.headingId ? [item.headingId] : []))
    } catch {
      return []
    }
  }, [shownSource])
  const tocCursor = useRef<TocCursor>({ n: 0, ids: [] })
  tocCursor.current.n = 0
  tocCursor.current.ids = headingIds
  const pageMode = useBodyMode()
  const headerInfo = useMemo(
    () => planHeaderInfo(shownSource, new Set(Object.keys(responses)), pageMode),
    [shownSource, responses, pageMode],
  )

  useLayoutEffect(() => {
    // A saved version shows the source it was rendered with. The device copy and the stream are the live plan.
    if (viewingPlanVersion() !== null) return
    let stopStore = () => {}
    const context = planContext()
    const paintFrom = (engine: NonNullable<ReturnType<typeof currentOfflineHandle>>) => {
      const row = engine.plan(context.id)
      if (!row?.source || row.sourceOmitted) return
      setBoot((current) => {
        const responses = row.responses as Boot['responses']
        // The store repaints on every write. Keep the page as it is when nothing it shows changed.
        if (
          current.source === row.source &&
          current.title === row.title &&
          current.locked === row.locked &&
          JSON.stringify(current.responses) === JSON.stringify(responses)
        ) {
          return current
        }
        return { ...current, source: row.source, title: row.title, responses, locked: row.locked }
      })
    }
    const ready = currentOfflineHandle()
    if (ready) paintFrom(ready)
    void startOfflineEngine().then((engine) => {
      if (!engine?.available) return
      const paint = () => paintFrom(engine)
      paint()
      stopStore = engine.subscribe(paint)
      void engine.syncPlan()
    })
    const apply = (next: Partial<Boot>) => setBoot((current) => ({ ...current, ...next }))
    const stopPlan = subscribePlanEvents('plan', (event) => {
      try {
        const payload = JSON.parse(event.data) as { source?: string; snapshots?: PlanSnapshotRecord[]; headSnapshotId?: string | null; responses?: Boot['responses']; locked?: boolean }
        apply({
          ...(typeof payload.source === 'string' ? { source: payload.source } : {}),
          ...(Array.isArray(payload.snapshots) ? { snapshots: payload.snapshots } : {}),
          ...(payload.headSnapshotId !== undefined ? { headSnapshotId: payload.headSnapshotId } : {}),
          ...(payload.responses ? { responses: payload.responses } : {}),
          ...(payload.locked !== undefined ? { locked: Boolean(payload.locked) } : {}),
        })
      } catch {
        // Ignore a malformed plan event.
      }
    })
    // Forms lock while a run is live. `hello` repeats the run each time the stream opens.
    const applyRun = (execution: unknown) => {
      if (!execution || typeof execution !== 'object') return
      const locked = Boolean((execution as { active?: unknown }).active)
      setBoot((current) => (current.locked === locked ? current : { ...current, locked }))
    }
    const stopExecution = subscribePlanEvents('execution', (event) => {
      try {
        applyRun(JSON.parse(event.data) as unknown)
      } catch {
        // Ignore a malformed execution event.
      }
    })
    const stopHello = subscribePlanEvents('hello', (event) => {
      try {
        applyRun((JSON.parse(event.data) as { execution?: unknown } | null)?.execution)
      } catch {
        // Ignore a malformed hello.
      }
    })
    const stopReload = subscribePlanEvents('reload', () => {
      void refreshLivePlan(setBoot)
    })
    const forward = (type: string) =>
      subscribePlanEvents(type, (event) => {
        void startOfflineEngine().then((engine) => {
          if (!engine?.available) return
          try {
            engine.noteLive(type, JSON.parse(event.data) as unknown)
          } catch {
            // The page still applies the event itself.
          }
        })
      })
    const stopForwardPlan = forward('plan')
    const stopForwardMode = forward('mode')
    const stopForwardExecution = forward('execution')
    const stopForwardComment = forward('comment')
    const stopForwardHello = forward('hello')
    return () => {
      stopStore()
      stopPlan()
      stopExecution()
      stopHello()
      stopReload()
      stopForwardPlan()
      stopForwardMode()
      stopForwardExecution()
      stopForwardComment()
      stopForwardHello()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    // Hide only the first render. Hiding a rendered plan collapses the page and resets the scroll.
    const root = document.getElementById('plan-mdx-root')
    if (!root?.querySelector('[data-plan-rendered]')) root?.classList.add('plan-mdx-pending')
    const source = pageSource
    const live = source === boot.source
    const render = async (Content: PlanModule, from: string): Promise<boolean> => {
      const fromMdx = planSourceToMdx(from)
      const [tableModule] = await Promise.all([
        planHasDataTable(fromMdx) ? import('./mdx/dataTable/register.tsx') : null,
        preloadPlanComponents(fromMdx),
      ])
      if (cancelled) return false
      const components = {
        ...planComponents,
        pre: PlanPre,
        table: MarkdownTable,
        input: MarkdownTaskCheckbox,
        phase: PlanPhase,
        callout: PlanCallout,
        ...interactiveComponents,
        checklist: PlanChecklist,
      }
      // Remember where the reader is and what the page shows, so the update can keep the place and point at what changed.
      const shown = document.getElementById('plan-mdx-root')
      pendingAnchor.current = scrollAnchor(shown)
      signatures.current = shown && contentRef.current ? readBlockSignatures(shown) : null
      setContent(
        <PlanBody
          Content={Content}
          source={from}
          components={{
            ...planComponents,
            ...components,
            h1: PlanH1,
            h2: PlanH2,
            h3: PlanH3,
            ...(tableModule?.dataTableComponents ?? {}),
          } as typeof planComponents}
        />,
      )
      setShownSource(from)
      return true
    }
    // Fetch the workflow, diagram, and chart code while the plan compiles.
    void preloadPlanComponents(mdx)
    compileMdx(mdx).then(
      async (Content) => {
        if (cancelled) return
        if (!(await render(Content, source))) return
        setError(null)
        // Unapplied changes are not the plan. Only the live plan is kept as the fallback.
        if (live) rememberLastRendered(source)
      },
      async (caught: unknown) => {
        if (cancelled) return
        const message = caught instanceof Error ? caught.message : 'Could not render the plan'
        setError(message)
        // Keep the plan on screen. An edit that does not compile must not hide it.
        if (contentRef.current) return
        for await (const fallback of fallbackSources(boot)) {
          if (cancelled || contentRef.current) return
          try {
            const Content = await compileMdx(planSourceToMdx(fallback))
            if (cancelled) return
            if (await render(Content, fallback)) return
          } catch {
            // That one does not compile either. Try an older one.
          }
        }
        // Nothing saved renders. The error stays on its own.
      },
    )
    return () => {
      cancelled = true
    }
  }, [mdx])

  useLayoutEffect(() => {
    const root = document.getElementById('plan-mdx-root')
    if (root) stampPlanParts(root)
  })

  // After a new version renders: keep the reader where they were, then flash the blocks that changed.
  useLayoutEffect(() => {
    const root = document.getElementById('plan-mdx-root')
    if (!root || !content) return
    restoreScrollAnchor(pendingAnchor.current)
    pendingAnchor.current = null
    if (signatures.current) markChangedBlocks(root, signatures.current, readBlockSignatures(root))
    signatures.current = null
  }, [content])

  // Announce a new document only when the compiled plan changed. A re-render for an answer or a
  // lock leaves the parts where they were, and an open comment box on one of them must stay open.
  const announced = useRef<ReactNode>(null)
  useEffect(() => {
    const root = document.getElementById('plan-mdx-root')
    if (!root) return
    stampPlanParts(root)
    root.classList.remove('plan-mdx-pending')
    if (announced.current === content) return
    announced.current = content
    window.dispatchEvent(new CustomEvent('living-plan-document', { detail: { root } }))
  })

  useEffect(() => {
    const seq = fileVersionSeq(boot.snapshots, boot.headSnapshotId)
    const name = fileVersionName(seq)
    const text = fileVersionText(seq)
    document.querySelectorAll('[data-file-version]').forEach((node) => {
      node.setAttribute('aria-label', name)
      node.setAttribute('title', name)
      const value = node.querySelector('[data-file-version-value]')
      if (value) value.textContent = text
    })
  }, [boot.snapshots, boot.headSnapshotId])

  // The agent wrote after the unapplied changes started. They go on top of its plan once no editor is open.
  const behind = draft !== null && !samePlanSource(draft.base, boot.source)
  const [rebaseFailed, setRebaseFailed] = useState<{ mine: string; theirs: string } | null>(null)
  const rebaseStuck =
    behind &&
    rebaseFailed !== null &&
    rebaseFailed.theirs === boot.source &&
    rebaseFailed.mine === (draft?.rebase?.mine ?? draft?.source)
  const rebasing = behind && !rebaseStuck
  // Blocks both the person and the agent changed. The person keeps a side of each before applying.
  const conflicts = draft?.rebase?.conflicts ?? []
  const [rebased, setRebased] = useState(false)
  const [resolving, setResolving] = useState(false)
  // Editing needs a rendered plan. The pill and E (client/planEditButton.ts) read this on each use.
  const editable = canEdit && content !== null && !rebasing && conflicts.length === 0
  const editState = useRef({ editable, editing: false })
  editState.current = { editable, editing: openEdit !== null }
  const pageSourceRef = useRef(pageSource)
  pageSourceRef.current = pageSource
  const shownSourceRef = useRef(shownSource)
  shownSourceRef.current = shownSource
  const draftRef = useRef(draft)
  draftRef.current = draft
  const moveBinding = useRef<BlockMoveBinding | null>(null)
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [draftKept, setDraftKept] = useState(true)
  const online = useOnline()

  useEffect(() => {
    if (!canEdit) return
    document.body.dataset.planEditable = editable ? 'true' : 'false'
  }, [canEdit, editable])

  useEffect(() => {
    if (!canEdit) return
    const open = (target: OpenEdit['target'], how?: EditHow) => {
      editIds.current += 1
      setOpenEdit({ id: editIds.current, target, caret: how?.caret, margins: how?.margins, source: pageSourceRef.current })
    }
    // Load the editor while the reader looks at the page, so a click on text or Edit opens at once.
    const warm = () => void loadBlockEditor().catch(() => undefined)
    document.addEventListener('pointerover', warm, { once: true, passive: true })
    const binding = bindBlockEditButton({
      state: () => editState.current,
      edit: (range, how) => open({ kind: 'edit', range, inline: how?.inline }, how),
      add: (after) => open({ kind: 'add', after }),
      cell: (range, caret) => open({ kind: 'cell', range }, { caret }),
    })
    editBinding.current = binding
    // Every block moves where it reads: its grip drags it, or opens Move up and Move down.
    const mover = bindBlockMove({
      state: () => editState.current,
      move: (range, target, place) => moveRef.current(range, target, place),
    })
    moveBinding.current = mover
    return () => {
      document.removeEventListener('pointerover', warm)
      editBinding.current = null
      moveBinding.current = null
      binding.stop()
      mover.stop()
    }
  }, [canEdit])

  // An editor opened, or the plan stopped being editable: the move grip goes.
  useEffect(() => {
    moveBinding.current?.refresh()
  }, [editable, openEdit])

  // A move waits for the page to draw it, so the grip follows the block and the next move has the new places.
  useEffect(() => {
    if (content) moveBinding.current?.rendered(shownSource)
  }, [content, shownSource])

  // A click on other text finished the editor that was open. That text opens once the page shows the edit.
  const hadEdit = useRef(false)
  useEffect(() => {
    if (openEdit) {
      hadEdit.current = true
      return
    }
    if (!hadEdit.current) return
    hadEdit.current = false
    const frame = requestAnimationFrame(() => editBinding.current?.closed())
    return () => cancelAnimationFrame(frame)
  }, [openEdit])

  // A draft from the whole-page editor (before 2.26) holds the editor's text. Turn it into a plan file once.
  useEffect(() => {
    if (!canEdit) return
    const stored = readDraft(planId)
    if (!stored || !isLegacyDraft(stored)) return
    void import('../src/planMdx/editSource.ts').then(({ planSourceFromEditor }) => {
      try {
        const source = planSourceFromEditor({ source: stored.base, edited: stored.markdown })
        if (samePlanSource(source, stored.base)) {
          clearDraft(planId)
          return
        }
        const next: PlanDraft = { base: stored.base, source, edits: 1, savedAt: stored.savedAt }
        writeDraft(planId, next)
        setDraft(next)
      } catch {
        // The draft does not read as a plan. It stays on this device untouched.
      }
    })
  }, [canEdit, planId])

  // Done keeps the edit; the editor closes once the page shows it.
  useEffect(() => {
    if (openEdit?.committed !== undefined && samePlanSource(shownSource, openEdit.committed)) setOpenEdit(null)
  }, [openEdit, shownSource])

  // The agent wrote after these changes started: put them on top of its plan. An open editor first
  // stages its edit against the file it opened on; this runs once it closes.
  useEffect(() => {
    if (!canEdit || !draft || openEdit || !rebasing) return
    let cancelled = false
    const theirs = boot.source
    const mine = draft.rebase?.mine ?? draft.source
    void rebasedDraft(draft, theirs, draft.rebase?.keep ?? {}).then((next) => {
      if (cancelled) return
      if (!next) {
        // Keep the changes as they are; the bar says applying will be refused and offers Discard.
        setRebaseFailed({ mine, theirs })
        return
      }
      setApplyError(null)
      setConfirmDiscard(false)
      if (!next.rebase && samePlanSource(next.source, theirs)) {
        // The agent made the same changes. Nothing is left to apply.
        clearDraft(planId)
        setDraft(null)
        return
      }
      setDraftKept(writeDraft(planId, next))
      setDraft(next)
      setRebased(true)
    })
    return () => {
      cancelled = true
    }
  }, [canEdit, draft, openEdit, rebasing, boot.source, planId])

  /** Keep `next` as one more unapplied change on top of `base`, or drop the changes when `next` is `base` again. */
  function keepChange(next: string, base: string, current: PlanDraft | null) {
    const kept: PlanDraft | null = samePlanSource(next, base)
      ? null
      : { base, source: next, edits: (current?.edits ?? 0) + 1, savedAt: Date.now() }
    if (kept) setDraftKept(writeDraft(planId, kept))
    else clearDraft(planId)
    setDraft(kept)
    setApplyError(null)
    setConfirmDiscard(false)
    setRebased(false)
  }

  const editSlot = useMemo<EditSlot | null>(() => {
    if (!openEdit) return null
    return {
      open: openEdit,
      cancel: () => setOpenEdit((current) => (current?.id === openEdit.id ? null : current)),
      commit: async (next) => {
        keepChange(next, draft?.base ?? openEdit.source, draft)
        setOpenEdit((current) => (current?.id === openEdit.id ? { ...current, committed: next } : current))
        return null
      },
    }
  }, [openEdit, draft, planId])

  // A block moved by its grip (client/planBlockMove.ts) is one more unapplied change, like an edit's Done.
  const moveRef = useRef<(range: string, target: string, place: BlockPlace) => Promise<BlockMoved | null>>(async () => null)
  moveRef.current = async (rangeText, targetText, place) => {
    const range = parseBlockRange(rangeText)
    const target = parseBlockRange(targetText)
    const from = pageSourceRef.current
    // The blocks on screen carry places in the file the page shows. A newer file that has not rendered has other places.
    if (!range || !target || from !== shownSourceRef.current) return null
    const result = moveBlock(from, range, target, place)
    if (!result || samePlanSource(result.source, from)) return null
    try {
      // The page compiles the same text next, from the same cache.
      await compileMdx(planSourceToMdx(result.source))
    } catch {
      window.showPlanToast?.('That move would leave the plan unable to render, so the block stayed where it was.', 'error')
      return null
    }
    // The plan changed while the move was checked, so its places are not this file's any more.
    if (pageSourceRef.current !== from) return null
    keepChange(result.source, draftRef.current?.base ?? from, draftRef.current)
    return { range: `${result.range.start}-${result.range.end}`, source: result.source }
  }

  async function applyChanges() {
    if (!draft || applying || draft.rebase) return
    setApplying(true)
    setApplyError(null)
    try {
      const result = await saveEditedSource(draft.base, draft.source)
      if (!result.ok) {
        setApplyError(result.message)
        // The agent wrote just now and the page has not heard yet. Read the plan, so the changes go on top of it.
        if (result.status === 409) void refreshLivePlan((payload) => setBoot((current) => ({ ...current, ...payload })))
        return
      }
      const payload = result.payload ?? {}
      clearDraft(planId)
      setBoot((current) => ({
        ...current,
        source: typeof payload.source === 'string' ? payload.source : draft.source,
        ...(Array.isArray(payload.snapshots) ? { snapshots: payload.snapshots } : {}),
        ...(payload.headSnapshotId !== undefined ? { headSnapshotId: payload.headSnapshotId } : {}),
      }))
      setDraft(null)
      setRebased(false)
    } finally {
      setApplying(false)
    }
  }

  function discardChanges() {
    if (!confirmDiscard) {
      setConfirmDiscard(true)
      return
    }
    clearDraft(planId)
    setDraft(null)
    setConfirmDiscard(false)
    setApplyError(null)
    setRebased(false)
  }

  /** Keep one side of a block both changed. The page shows the choice; Apply waits for the last one. */
  async function keepSide(conflict: DraftConflict, side: DraftSide) {
    if (!draft?.rebase || resolving || rebasing) return
    setResolving(true)
    setApplyError(null)
    setConfirmDiscard(false)
    try {
      const next = await rebasedDraft(draft, draft.base, { ...draft.rebase.keep, [conflict.key]: side })
      if (!next) {
        setApplyError('That choice leaves the plan unable to render. Keep the other version, or discard.')
        return
      }
      if (!next.rebase && samePlanSource(next.source, draft.base)) {
        // Every block kept the agent's version: nothing is left to apply.
        clearDraft(planId)
        setDraft(null)
        setRebased(false)
        return
      }
      setDraftKept(writeDraft(planId, next))
      setDraft(next)
      setRebased(!next.rebase)
    } finally {
      setResolving(false)
    }
  }

  useEffect(() => {
    const list = document.getElementById('plan-toc-list')
    if (!list) return
    try {
      list.innerHTML = renderTocItemsHtml(buildPlanToc(shownSource))
      window.dispatchEvent(new Event('living-plan-toc'))
    } catch {
      // Keep the server-rendered list when the source cannot be outlined.
    }
  }, [shownSource])

  return (
    <InteractionContext.Provider value={interaction}>
    <TocHeadingCursor.Provider value={tocCursor}>
    <PlanHeaderContext.Provider value={headerInfo}>
      {error && content && stale ? (
        <p className="lock-banner" role="status" data-plan-stale="">
          The latest update to this plan could not be shown. This is the last version that rendered. {error}
        </p>
      ) : error ? (
        <p className="host-error" role="alert" data-plan-error="">
          {error}
        </p>
      ) : null}
      {content ? (
        <EditSlotContext.Provider value={editSlot}>
          <article className="plan-document plan-ui" data-plan-rendered="" data-plan-draft={draft ? '' : undefined}>
            {content}
          </article>
        </EditSlotContext.Provider>
      ) : error ? null : (
        <p data-plan-rendering="">Rendering plan…</p>
      )}
      {editable && !openEdit ? (
        <button
          type="button"
          className="plan-add-block"
          data-plan-add-block=""
          onClick={() => {
            editIds.current += 1
            setOpenEdit({ id: editIds.current, target: { kind: 'add', after: null }, source: pageSource })
          }}
        >
          <span aria-hidden="true">+</span> Add a block
        </button>
      ) : null}
      {draft && canEdit && !openEdit ? (
        <div
          className="plan-apply-bar"
          role="region"
          aria-label="Changes not applied"
          data-plan-apply-bar=""
          data-plan-conflicts={conflicts.length > 0 ? String(conflicts.length) : undefined}
        >
          <div className="plan-apply-text">
            <span className="plan-apply-title" role="status">
              {conflicts.length === 1
                ? "1 of your changes overlaps the agent's"
                : conflicts.length > 1
                  ? `${conflicts.length} of your changes overlap the agent's`
                  : draft.edits === 1
                    ? '1 change not applied'
                    : `${draft.edits} changes not applied`}
            </span>
            <span className="plan-apply-note" data-plan-apply-note="">
              {applyError
                ? applyError
                : conflicts.length > 0
                  ? conflicts.length === 1
                    ? "The agent changed that block too. The page shows the agent's version until you choose."
                    : "The agent changed those blocks too. The page shows the agent's versions until you choose."
                  : rebaseStuck
                    ? 'The plan changed after these edits started, so applying will be refused. Discard to edit the new version.'
                    : rebasing
                      ? 'The agent updated the plan. Bringing your changes onto it…'
                      : !draftKept
                        ? 'This browser did not keep the changes. Apply them before you close the page.'
                        : rebased
                          ? 'The agent updated the plan. Your changes are kept on top of it.'
                          : !online
                            ? 'Kept on this device. Apply them when you are back online.'
                            : 'Kept on this device. Apply to save a new version of the plan.'}
            </span>
          </div>
          <div className="plan-apply-actions">
            <Button variant="ghost" onClick={discardChanges} disabled={applying || resolving} data-plan-discard="">
              {confirmDiscard ? 'Discard changes?' : 'Discard'}
            </Button>
            <Button
              variant="primary"
              onClick={() => void applyChanges()}
              disabled={applying || !online || rebasing || conflicts.length > 0}
              title={
                conflicts.length > 0
                  ? 'Keep one version of each overlapping block first'
                  : online
                    ? 'Save these changes as a new version of the plan'
                    : 'Applying needs a connection. The changes stay on this device.'
              }
              data-plan-apply=""
            >
              {applying ? 'Applying…' : 'Apply changes'}
            </Button>
          </div>
          {conflicts.length > 0 ? (
            <ul className="plan-apply-conflicts" aria-label="Changes that overlap the agent's" data-plan-conflict-list="">
              {conflicts.map((conflict) => (
                <li key={conflict.key} className="plan-apply-conflict" data-plan-conflict={conflict.key}>
                  <div className="plan-apply-conflict-text">
                    <span className="plan-apply-conflict-label">
                      {conflict.label}
                      {conflict.within ? <span className="plan-apply-conflict-within"> in {conflict.within}</span> : null}
                    </span>
                    <span className="plan-apply-conflict-detail">{conflictDetail(conflict)}</span>
                  </div>
                  <div className="plan-apply-conflict-actions">
                    <Button
                      variant="secondary"
                      onClick={() => void keepSide(conflict, 'mine')}
                      disabled={resolving || rebasing}
                      aria-label={`Keep mine: ${conflict.label}`}
                      data-plan-keep-mine=""
                    >
                      Keep mine
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => void keepSide(conflict, 'theirs')}
                      disabled={resolving || rebasing}
                      aria-label={`Keep the agent's: ${conflict.label}`}
                      data-plan-keep-theirs=""
                    >
                      Keep the agent's
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </PlanHeaderContext.Provider>
    </TocHeadingCursor.Provider>
    </InteractionContext.Provider>
  )
}

if (typeof document !== 'undefined') {
  const root = document.getElementById('plan-mdx-root')
  if (root) createRoot(root).render(<PlanMdxApp />)
}
