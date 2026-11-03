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
import { currentOfflineHandle, planContext, postPlanMutation, startOfflineEngine } from './offline/engine.ts'
import { stampPlanParts } from './stampPlanParts.ts'

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
  const result = await postPlanMutation('interaction', apiPath(`/api/interactions/${encodeURIComponent(response.id)}`), response)
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

function PlanMdxApp() {
  const [boot, setBoot] = useState<Boot>(readBoot)
  const [content, setContent] = useState<ReactNode>(null)
  const [error, setError] = useState<string | null>(null)
  const mdx = planSourceToMdx(boot.source)
  const responses = boot.responses
  const locked = boot.locked
  const interaction = useMemo<InteractionState>(() => ({ responses, locked }), [responses, locked])
  const headingIds = useMemo(() => {
    try {
      return buildPlanToc(boot.source).flatMap((item) => (item.headingId ? [item.headingId] : []))
    } catch {
      return []
    }
  }, [boot.source])
  const tocCursor = useRef<TocCursor>({ n: 0, ids: [] })
  tocCursor.current.n = 0
  tocCursor.current.ids = headingIds

  useLayoutEffect(() => {
    let stopStore = () => {}
    const context = planContext()
    const paintFrom = (engine: NonNullable<ReturnType<typeof currentOfflineHandle>>) => {
      const row = engine.plan(context.id)
      if (!row?.source || row.sourceOmitted) return
      setBoot((current) => ({
        ...current,
        source: row.source,
        title: row.title,
        responses: row.responses as Boot['responses'],
        locked: row.locked,
      }))
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
    const stopReload = subscribePlanEvents('reload', () => {
      void startOfflineEngine().then(async (engine) => {
        if (engine?.available) {
          await engine.syncPlan()
          return
        }
        const response = await fetch(apiPath('/api/plan-mdx'), { cache: 'no-store' }).catch(() => null)
        if (!response?.ok) return
        const payload = (await response.json()) as Boot
        if (typeof payload.source === 'string') setBoot(payload)
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
    return () => {
      stopStore()
      stopPlan()
      stopReload()
      stopForwardPlan()
      stopForwardMode()
      stopForwardExecution()
      stopForwardComment()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    // Hide only the first render. Hiding a rendered plan collapses the page and resets the scroll.
    const root = document.getElementById('plan-mdx-root')
    if (!root?.querySelector('[data-plan-rendered]')) root?.classList.add('plan-mdx-pending')
    compileMdx(mdx).then(
      async (Content) => {
        if (cancelled) return
        const tableModule = planHasDataTable(mdx) ? await import('./mdx/dataTable/register.tsx') : null
        if (cancelled) return
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
        setError(null)
      },
      (caught: unknown) => {
        if (cancelled) return
        setContent(null)
        setError(caught instanceof Error ? caught.message : 'Could not render the plan')
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

  useEffect(() => {
    const root = document.getElementById('plan-mdx-root')
    if (!root) return
    stampPlanParts(root)
    root.classList.remove('plan-mdx-pending')
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
      list.innerHTML = renderTocItemsHtml(buildPlanToc(boot.source))
      window.dispatchEvent(new Event('living-plan-toc'))
    } catch {
      // Keep the server-rendered list when the source cannot be outlined.
    }
  }, [boot.source])

  return (
    <InteractionContext.Provider value={interaction}>
    <TocHeadingCursor.Provider value={tocCursor}>
      {error ? (
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
