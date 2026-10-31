import { createFileRoute } from '@tanstack/react-router'
import sample from '../../../examples/rate-limit.plan.md?raw'
import { PlanShell } from '../PlanShell.tsx'
import { planBootstrap } from '../planFns.ts'

export const Route = createFileRoute('/local')({
  loader: () => planBootstrap({ data: sample }),
  component: LocalPlanPage,
})

function bootJson(source: string): string {
  return JSON.stringify({
    source,
    title: 'Rate limiting rollout',
    responses: {},
    locked: false,
    snapshots: [],
    headSnapshotId: null,
  }).replaceAll('<', '\\u003c')
}

function LocalPlanPage() {
  const { bootstrap } = Route.useLoaderData()
  return (
    <PlanShell
      title="Rate limiting rollout"
      source={sample}
      mode="watch"
      host="local"
      pageWidth="default"
      accent="#0f766e"
      diffsTheme="pierre"
      wrapCode={false}
      basePath=""
      bootstrap={bootstrap}
    >
      <script type="application/json" id="living-plan-mdx" dangerouslySetInnerHTML={{ __html: bootJson(sample) }} />
      <script type="application/json" id="living-plan-comments" dangerouslySetInnerHTML={{ __html: '[]' }} />
      <script type="application/json" id="living-plan-review" dangerouslySetInnerHTML={{ __html: 'null' }} />
    </PlanShell>
  )
}
