import { Suspense, lazy, type ComponentProps, type ComponentType } from 'react'
import { editLocked } from './entries/planEntry'
import type { BarChart } from './mdx/BarChart'
import { docBlockComponents } from './mdx/docBlocks'
import type { LineChart } from './mdx/LineChart'
import type { Mermaid } from './mdx/Mermaid'
import { Row } from './mdx/Row'
import { Stack } from './mdx/Stack'
import type { Workflow } from './mdx/Workflow'
import { components as uiComponents } from './entries'
import { Field, Item } from './entries/mdxEntries'

type Deferred<P> = {
  Component: ComponentType<P>
  preload: () => Promise<unknown>
}

/**
 * A plan component whose code is fetched only for a plan that uses it. `preload` starts the fetch
 * before the first render, so the page draws in one pass. A component used without it still
 * renders, through a lazy load.
 */
function deferred<P extends object>(load: () => Promise<ComponentType<P>>): Deferred<P> {
  let ready: ComponentType<P> | null = null
  let pending: Promise<ComponentType<P>> | null = null
  const preload = () => {
    pending ??= load().then(
      (component) => (ready = component),
      (error: unknown) => {
        pending = null
        throw error
      },
    )
    return pending
  }
  const Lazy = lazy(() => preload().then((component) => ({ default: component })))
  function DeferredComponent(props: P) {
    const Ready = ready
    if (Ready) return <Ready {...props} />
    return (
      <Suspense fallback={null}>
        <Lazy {...props} />
      </Suspense>
    )
  }
  return { Component: DeferredComponent, preload }
}

// ELK, Pele, and TanStack Charts are most of the plan page's code. Each loads only for a plan that draws it.
const workflow = deferred<ComponentProps<typeof Workflow>>(() => import('./mdx/Workflow').then((module) => module.Workflow))
const mermaid = deferred<ComponentProps<typeof Mermaid>>(() => import('./mdx/Mermaid').then((module) => module.Mermaid))
const barChart = deferred<ComponentProps<typeof BarChart>>(() => import('./mdx/BarChart').then((module) => module.BarChart))
const lineChart = deferred<ComponentProps<typeof LineChart>>(() => import('./mdx/LineChart').then((module) => module.LineChart))

/** Each deferred component, and a test for its tag in the plan's MDX. A false match only loads code early. */
const DEFERRED: ReadonlyArray<{ uses: RegExp; preload: () => Promise<unknown> }> = [
  { uses: /<\s*workflow\b/i, preload: workflow.preload },
  // A mermaid fence compiles to <Mermaid>.
  { uses: /<\s*Mermaid\b|(?:`{3,}|~{3,})[ \t]*mermaid\b/, preload: mermaid.preload },
  { uses: /<\s*BarChart\b/, preload: barChart.preload },
  { uses: /<\s*LineChart\b/, preload: lineChart.preload },
]

/**
 * Fetch the deferred components this plan uses. Resolves once they are ready, or once a fetch
 * fails: the component then retries on render.
 */
export async function preloadPlanComponents(mdx: string): Promise<void> {
  await Promise.all(DEFERRED.filter((item) => item.uses.test(mdx)).map((item) => item.preload().catch(() => undefined)))
}

/**
 * A component that does not mark `locked` itself (layout, figures, the workflow, a data table) is
 * wrapped so the page sees the lock and shows no Edit on it (ADR 0039). The wrapper has no box of
 * its own. The `locked` prop is not passed down, so it never reaches the DOM.
 */
export function lockable<P extends object>(Component: ComponentType<P>): ComponentType<P & { locked?: unknown; 'data-plan-block'?: string }> {
  function Lockable({ locked, 'data-plan-block': blockRange, ...props }: P & { locked?: unknown; 'data-plan-block'?: string }) {
    const inner = <Component {...(props as P)} />
    const isLocked = editLocked(locked)
    // A top-level block carries its place in the plan file (ADR 0040). These components do not take
    // it, so a frame does: a real box, so the page can find and measure the block it edits.
    if (blockRange) {
      return (
        <div className="plan-block-frame" data-plan-block={blockRange} data-edit-locked={isLocked ? 'true' : undefined}>
          {inner}
        </div>
      )
    }
    if (!isLocked) return inner
    return (
      <div className="plan-edit-lock" data-edit-locked="true">
        {inner}
      </div>
    )
  }
  Lockable.displayName = `Lockable(${Component.displayName ?? Component.name ?? 'Component'})`
  return Lockable
}

const LockableStack = lockable(Stack)
const LockableRow = lockable(Row)
const LockableWorkflow = lockable(workflow.Component)
const LockableMermaid = lockable(mermaid.Component)
const LockableBarChart = lockable(barChart.Component)
const LockableLineChart = lockable(lineChart.Component)
const LockableBox = lockable(uiComponents.Box)
const LockableHStack = lockable(uiComponents.HStack)
const LockableVStack = lockable(uiComponents.VStack)
const LockableResponsiveStack = lockable(uiComponents.ResponsiveStack)

/**
 * Plan entries for the page, plus the ELK workflow, Pele diagrams, and TanStack charts.
 * Lowercase keys are the tags in the plan source.
 */
export const planComponents = {
  ...uiComponents,
  ...docBlockComponents,
  field: Field,
  Field,
  item: Item,
  Item,
  workflow: LockableWorkflow,
  Workflow: LockableWorkflow,
  box: LockableBox,
  Box: LockableBox,
  hstack: LockableHStack,
  HStack: LockableHStack,
  vstack: LockableVStack,
  VStack: LockableVStack,
  responsiveStack: LockableResponsiveStack,
  ResponsiveStack: LockableResponsiveStack,
  Stack: LockableStack,
  Row: LockableRow,
  Mermaid: LockableMermaid,
  BarChart: LockableBarChart,
  LineChart: LockableLineChart,
}
