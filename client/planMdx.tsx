import { run } from '@mdx-js/mdx'
import { Children, isValidElement, useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import * as runtime from 'react/jsx-runtime'
import type { PlanSnapshotRecord } from '../src/planSnapshots.ts'
import { planSourceToMdx } from '../src/planMdx/source.ts'
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
  const result = await fetch(apiPath(`/api/interactions/${encodeURIComponent(response.id)}`), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(response),
  })
  if (!result.ok) throw new Error((await result.text()) || 'Could not send')
}

function blockClass(className?: string): string {
  return [className, 'block'].filter(Boolean).join(' ')
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

function PlanMdxApp() {
  const [boot, setBoot] = useState<Boot>(readBoot)
  const [content, setContent] = useState<ReactNode>(null)
  const [error, setError] = useState<string | null>(null)
  const mdx = planSourceToMdx(boot.source)
  const responses = boot.responses
  const locked = boot.locked

  useEffect(() => {
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
      void fetch(apiPath('/api/plan-mdx'), { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload: Boot | null) => {
          if (payload && typeof payload.source === 'string') setBoot(payload)
        })
        .catch(() => undefined)
    })
    return () => {
      stopPlan()
      stopReload()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const root = document.getElementById('plan-mdx-root')
    root?.classList.add('plan-mdx-pending')
    compileMdx(mdx).then(
      async (Content) => {
        if (cancelled) return
        const tableModule = planHasDataTable(mdx) ? await import('./mdx/dataTable/register.tsx') : null
        if (cancelled) return
        const components = {
          ...planComponents,
          pre: PlanPre,
          table: MarkdownTable,
          phase: (props: { className?: string }) => <Phase {...props} className={blockClass(props.className)} />,
          callout: (props: { className?: string }) => <Callout {...props} className={blockClass(props.className)} />,
          choice: (props: { className?: string; id: string }) => {
            const saved = responses[props.id]
            return (
              <div onClick={(event) => event.stopPropagation()} onSubmit={(event) => event.stopPropagation()}>
                <Choice
                  {...props}
                  className={blockClass(props.className)}
                  locked={locked}
                  selectedId={saved?.kind === 'choice' ? saved.optionId : undefined}
                  selectedLabel={saved?.kind === 'choice' ? saved.label : undefined}
                  onSelect={(response) => {
                    void postInteraction(response)
                  }}
                />
              </div>
            )
          },
          form: (props: { className?: string; id: string }) => {
            const saved = responses[props.id]
            return (
              <div onClick={(event) => event.stopPropagation()} onSubmit={(event) => event.stopPropagation()}>
                <Form
                  {...props}
                  className={blockClass(props.className)}
                  locked={locked}
                  values={saved?.kind === 'form' ? saved.values : undefined}
                  onSubmit={(response) => {
                    void postInteraction(response)
                  }}
                />
              </div>
            )
          },
          questions: (props: { className?: string; id: string }) => {
            const saved = responses[props.id]
            return (
              <div onClick={(event) => event.stopPropagation()} onSubmit={(event) => event.stopPropagation()}>
                <Questions
                  {...props}
                  className={blockClass(props.className)}
                  locked={locked}
                  answers={saved?.kind === 'questions' ? saved.answers : undefined}
                  onSubmit={(response) => {
                    void postInteraction(response)
                  }}
                />
              </div>
            )
          },
          approve: (props: { className?: string; id: string }) => {
            const saved = responses[props.id]
            return (
              <div onClick={(event) => event.stopPropagation()} onSubmit={(event) => event.stopPropagation()}>
                <Approve
                  {...props}
                  className={blockClass(props.className)}
                  locked={locked}
                  approved={saved?.kind === 'approve' ? saved.approved : undefined}
                  note={saved?.kind === 'approve' ? saved.note : undefined}
                  onDecide={(response) => {
                    void postInteraction(response)
                  }}
                />
              </div>
            )
          },
          checklist: (props: { className?: string }) => <Checklist {...props} className={blockClass(props.className)} />,
        }
        setContent(
          <Content
            components={{
              ...planComponents,
              ...components,
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
  }, [locked, mdx, responses])

  useEffect(() => {
    const root = document.getElementById('plan-mdx-root')
    if (!root) return
    stampPlanParts(root)
    root.classList.remove('plan-mdx-pending')
    window.dispatchEvent(new CustomEvent('living-plan-document', { detail: { root } }))
  })

  async function restore(snapshotId: string) {
    const result = await fetch(apiPath('/api/plan-mdx/restore'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ snapshotId }),
    })
    if (!result.ok) return
    const payload = (await result.json()) as Boot
    if (typeof payload.source === 'string') setBoot(payload)
  }

  return (
    <>
      <SnapshotRail snapshots={boot.snapshots} headId={boot.headSnapshotId} onRestore={(id) => void restore(id)} />
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
    </>
  )
}

function SnapshotRail({
  snapshots,
  headId,
  onRestore,
}: {
  snapshots: PlanSnapshotRecord[]
  headId: string | null
  onRestore: (snapshotId: string) => void
}) {
  if (snapshots.length === 0) return null
  return (
    <section className="plan-snapshots" data-plan-grab-ignore="" aria-label="Plan snapshots">
      <h2>Snapshots</h2>
      <ol>
        {snapshots.map((snapshot) => (
          <li key={snapshot.id}>
            <button type="button" disabled={snapshot.id === headId} onClick={() => onRestore(snapshot.id)}>
              {snapshot.seq}. {snapshot.reason}
              {snapshot.restoredFromId ? ' (restored)' : ''}
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}

const root = document.getElementById('plan-mdx-root')
if (root) {
  createRoot(root).render(<PlanMdxApp />)
}
