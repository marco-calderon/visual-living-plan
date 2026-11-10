import { run } from '@mdx-js/mdx'
import { Children, Suspense, cloneElement, createContext, isValidElement, lazy, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type ReactElement, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import * as runtime from 'react/jsx-runtime'
import { fileVersionName, fileVersionSeq, fileVersionText } from '../src/fileVersion.ts'
import type { PlanSnapshotRecord } from '../src/planSnapshots.ts'
import { planSourceToMdx } from '../src/planMdx/source.ts'
import { buildPlanToc, renderTocItemsHtml } from '../src/planToc.ts'
import type { InteractionResponse } from '../src/types.ts'
import { planComponents, preloadPlanComponents } from './planComponents.tsx'
import { compilePlanMdx } from '../src/planMdx/compilePlanMdx.ts'
import { planHasDataTable } from './mdx/dataTable/detect.ts'
import { MarkdownTable } from './mdx/MarkdownTable.tsx'
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
import { Button } from './ui/button.tsx'
import { readDraft, type PlanDraft } from './editor/draftStore.ts'
import { PencilLine } from 'lucide-react'

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

function PlanMarkdownHeading({ level, children }: { level: 1 | 2 | 3; children?: ReactNode }) {
  const cursor = useContext(TocHeadingCursor)
  let id: string | undefined
  if (cursor) {
    id = cursor.current.ids[cursor.current.n]
    cursor.current.n += 1
  }
  if (level === 1) return <h1 id={id}>{children}</h1>
  if (level === 2) return <h2 id={id}>{children}</h2>
  return <h3 id={id}>{children}</h3>
}

function PlanH1(props: { children?: ReactNode }) {
  return <PlanMarkdownHeading level={1} {...props} />
}

function PlanH2(props: { children?: ReactNode }) {
  return <PlanMarkdownHeading level={2} {...props} />
}

function PlanH3(props: { children?: ReactNode }) {
  return <PlanMarkdownHeading level={3} {...props} />
}

const LazyPlanEditor = lazy(() => import('./editor/PlanEditor.tsx').then((module) => ({ default: module.PlanEditor })))

type SaveResult = { ok: true } | { ok: false; message: string }

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
  return { ok: false, message: message || `Could not save the plan (${response.status})` }
}

const LazyCodeBlock = lazy(() => import('./CodeBlock.tsx').then((module) => ({ default: module.CodeBlock })))

/**
 * Code renders through React, so a live edit updates it in place. A DOM swap outside React would
 * leave React holding a detached node that later edits and removals cannot reach.
 */
function PlanPre({ children }: { children?: ReactNode }) {
  const child = Children.toArray(children).find((node) => isValidElement<{ className?: string; children?: ReactNode }>(node))
  const className = child && isValidElement<{ className?: string }>(child) ? (child.props.className ?? '') : ''
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
    <div className="code-host" data-react-code="" data-source={code}>
      <Suspense fallback={plain}>
        <LazyCodeBlock code={code} language={diff ? '' : lang} diff={diff} />
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

type PlanBodyProps = { Content: PlanModule; components: typeof planComponents }

/**
 * One component type for every version of the plan. The compiled function is called here rather
 * than mounted, so React compares the new blocks with the ones on the page and keeps what did not
 * change. Mounting a new compiled component would replace the whole document on each edit.
 */
function PlanBody({ Content, components }: PlanBodyProps) {
  const tree = (Content as (props: { components: typeof planComponents }) => ReactNode)({ components })
  return <>{keyedBlocks(tree)}</>
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

function PlanChoice(props: { className?: string; id: string }) {
  const { responses, locked } = useContext(InteractionContext)
  const saved = responses[props.id]
  return (
    <div onClick={stopBubble} onSubmit={stopBubble}>
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

function PlanForm(props: { className?: string; id: string }) {
  const { responses, locked } = useContext(InteractionContext)
  const saved = responses[props.id]
  return (
    <div onClick={stopBubble} onSubmit={stopBubble}>
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

function PlanQuestions(props: { className?: string; id: string }) {
  const { responses, locked } = useContext(InteractionContext)
  const saved = responses[props.id]
  return (
    <div onClick={stopBubble} onSubmit={stopBubble}>
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

function PlanApprove(props: { className?: string; id: string }) {
  const { responses, locked } = useContext(InteractionContext)
  const saved = responses[props.id]
  return (
    <div onClick={stopBubble} onSubmit={stopBubble}>
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

function PlanPhase(props: { className?: string }) {
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

function PlanMdxApp() {
  const [boot, setBoot] = useState<Boot>(readBoot)
  const [content, setContent] = useState<ReactNode>(null)
  const pendingAnchor = useRef<ScrollAnchor | null>(null)
  const signatures = useRef<BlockSignatures | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The source editing started from. Null while the page shows the plan.
  // The open edit: the plan file it started from and the draft it continues. Null while the page shows the plan.
  const [editing, setEditing] = useState<{ base: string; draft: PlanDraft | null } | null>(null)
  const planId = planContext().id
  const [hasDraft, setHasDraft] = useState(() => readDraft(planId) !== null)
  // A local plan, or a hosted plan this account owns. A saved version is read-only.
  const canEdit =
    viewingPlanVersion() === null && (planContext().host === 'local' || document.body.dataset.planOwner === 'true')
  // The source on screen. It lags `boot.source` when the newest source does not compile.
  const [shownSource, setShownSource] = useState<string>(boot.source)
  const stale = shownSource !== boot.source
  const contentRef = useRef<ReactNode>(null)
  contentRef.current = content
  const mdx = planSourceToMdx(boot.source)
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
      void startOfflineEngine().then(async (engine) => {
        if (engine?.available) {
          await engine.syncPlan()
          return
        }
        const payload = await sharedQueryClient()
          .fetchQuery({ queryKey: ['plan-mdx', apiPath('')], queryFn: readPlanMdx, staleTime: 0 })
          .catch(() => null)
        if (payload && typeof payload.source === 'string') setBoot(payload)
      })
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
    const source = boot.source
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
        phase: PlanPhase,
        callout: PlanCallout,
        ...interactiveComponents,
        checklist: PlanChecklist,
      }
      // Remember where the reader is and what the page shows, so the update can keep the place and point at what changed.
      const live = document.getElementById('plan-mdx-root')
      pendingAnchor.current = scrollAnchor(live)
      signatures.current = live && contentRef.current ? readBlockSignatures(live) : null
      setContent(
        <PlanBody
          Content={Content}
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
        rememberLastRendered(source)
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
      {error && content && stale ? (
        <p className="lock-banner" role="status" data-plan-stale="">
          The latest update to this plan could not be shown. This is the last version that rendered. {error}
        </p>
      ) : error ? (
        <p className="host-error" role="alert" data-plan-error="">
          {error}
        </p>
      ) : null}
      {editing !== null ? (
        <Suspense fallback={<p data-plan-rendering="">Opening the editor…</p>}>
          <LazyPlanEditor
            planId={planId}
            base={editing.base}
            draft={editing.draft}
            outdated={boot.source !== editing.base}
            onClose={() => {
              setEditing(null)
              setHasDraft(readDraft(planId) !== null)
            }}
            publish={async (next) => {
              const result = await saveEditedSource(editing.base, next)
              if (result.ok && result.payload) {
                const payload = result.payload
                setBoot((current) => ({
                  ...current,
                  ...(typeof payload.source === 'string' ? { source: payload.source } : {}),
                  ...(Array.isArray(payload.snapshots) ? { snapshots: payload.snapshots } : {}),
                  ...(payload.headSnapshotId !== undefined ? { headSnapshotId: payload.headSnapshotId } : {}),
                }))
              }
              return result.ok ? { ok: true } : result
            }}
          />
        </Suspense>
      ) : null}
      {content && editing === null && canEdit ? (
        <div className="plan-edit-toggle">
          <Button
            variant="secondary"
            data-plan-edit=""
            data-plan-has-draft={hasDraft ? 'true' : undefined}
            title={hasDraft ? 'Continue the unpublished edit saved on this device' : 'Edit this plan'}
            onClick={() => {
              const draft = readDraft(planId)
              setEditing({ base: draft?.base ?? boot.source, draft })
            }}
          >
            <PencilLine size={16} aria-hidden="true" />
            {hasDraft ? 'Resume draft' : 'Edit'}
          </Button>
        </div>
      ) : null}
      {content ? (
        <article className="plan-document plan-ui" data-plan-rendered="" hidden={editing !== null}>
          {content}
        </article>
      ) : error ? null : (
        <p data-plan-rendering="">Rendering plan…</p>
      )}
    </TocHeadingCursor.Provider>
    </InteractionContext.Provider>
  )
}

if (typeof document !== 'undefined') {
  const root = document.getElementById('plan-mdx-root')
  if (root) createRoot(root).render(<PlanMdxApp />)
}
