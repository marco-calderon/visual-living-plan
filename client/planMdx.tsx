import { run } from '@mdx-js/mdx'
import { Children, createContext, isValidElement, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import * as runtime from 'react/jsx-runtime'
import { fileVersionName, fileVersionSeq, fileVersionText } from '../src/fileVersion.ts'
import type { PlanSnapshotRecord } from '../src/planSnapshots.ts'
import { planSourceToMdx } from '../src/planMdx/source.ts'
import { buildPlanToc, renderTocItemsHtml } from '../src/planToc.ts'
import type { InteractionResponse } from '../src/types.ts'
import { planComponents } from './planComponents.tsx'
import { compilePlanMdx } from './mdx/compilePlanMdx.ts'
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
import { viewingPlanVersion } from './versionView.ts'
import { sendPlanMutation, sharedQueryClient } from './queryClient.tsx'

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

function PlanPre({ children }: { children?: ReactNode }) {
  const child = Children.toArray(children).find((node) => isValidElement<{ className?: string; children?: ReactNode }>(node))
  const className = child && isValidElement<{ className?: string }>(child) ? (child.props.className ?? '') : ''
  const lang = /language-([\w+-]+)/.exec(className)?.[1] ?? ''
  const diff = lang === 'diff' || lang === 'patch'
  return (
    <pre className="code-block" data-lang={lang && !diff ? lang : undefined} data-diff={diff ? 'true' : undefined}>
      <code>{child && isValidElement<{ children?: ReactNode }>(child) ? child.props.children : children}</code>
    </pre>
  )
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
  const [error, setError] = useState<string | null>(null)
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
      const tableModule = planHasDataTable(planSourceToMdx(from)) ? await import('./mdx/dataTable/register.tsx') : null
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
      setContent(
        <Content
          components={{
            ...planComponents,
            ...components,
            h1: PlanH1,
            h2: PlanH2,
            h3: PlanH3,
            ...(tableModule?.dataTableComponents ?? {}),
          }}
        />,
      )
      setShownSource(from)
      return true
    }
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
      {content ? (
        <article className="plan-document plan-ui" data-plan-rendered="">
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
