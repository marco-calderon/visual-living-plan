import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'

const SAMPLE_ID = 'rate-limit-sample'

export type AccountPayload = {
  user: { id: string; email: string; name: string; tier: string }
  settings: {
    accent: string
    pageWidth: 'default' | 'wide' | 'full'
    diffsTheme: string
    wrapCode: boolean
  }
  plans: Array<{ id: string; title: string; mode: string }>
}

export type HistoryPayload = {
  title: string
  planId: string
  name: string
  versions: Array<{ seq: number; title: string; createdAt: number }>
}

async function workerAndEnv() {
  return Promise.all([import('./host/app.ts'), import('cloudflare:workers')])
}

export const loadAccount = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest()
  const [{ handleHostRequest }, { env }] = await workerAndEnv()
  const response = await handleHostRequest(
    new Request(new URL('/api/account', request.url), {
      headers: { cookie: request.headers.get('cookie') ?? '' },
    }),
    env,
  )
  if (!response.ok) {
    return { ok: false as const, status: response.status, message: await response.text() }
  }
  const account = (await response.json()) as AccountPayload
  return { ok: true as const, account }
})

export const loadHistory = createServerFn({ method: 'GET' })
  .validator((planId: string) => planId)
  .handler(async ({ data: planId }) => {
    const request = getRequest()
    const [{ hostedPlanVersions }, { env }] = await workerAndEnv()
    const response = await hostedPlanVersions(request, env, planId)
    if (!response.ok) {
      return { ok: false as const, status: response.status, message: await response.text() }
    }
    const history = (await response.json()) as HistoryPayload
    return { ok: true as const, history }
  })

export const loadPlan = createServerFn({ method: 'GET' })
  .validator((planId: string) => planId)
  .handler(async ({ data: planId }) => {
    const request = getRequest()
    const [{ hostedPlanPage }, { env }] = await workerAndEnv()
    const response = await hostedPlanPage(request, env, planId)
    if (!response.ok) {
      return { ok: false as const, status: response.status, message: await response.text() }
    }
    const page = (await response.json()) as {
      title: string
      source: string
      mode: string
      responses: unknown
      comments: unknown
      review: unknown
      owner: boolean
      email: string
      name?: string
      accent: string
      pageWidth: 'default' | 'wide' | 'full'
      diffsTheme: string
      wrapCode: boolean
      execution?: { active?: boolean }
    }
    return { ok: true as const, page: { ...page, bootstrap: await workflowBootstrap(page.source, page.execution) } }
  })

async function workflowBootstrap(source: string, execution?: { active?: boolean }): Promise<string> {
  try {
    const [{ parsePlan }, { createIdleExecutionState }, { buildExpectedGraph }] = await Promise.all([
      import('./parse.ts'),
      import('./execution.ts'),
      import('./expectedWorkflow.ts'),
    ])
    const plan = parsePlan(source)
    const state = { ...createIdleExecutionState(), ...(execution ?? {}), planned: buildExpectedGraph(plan) }
    return JSON.stringify(state).replaceAll('<', '\\u003c')
  } catch (error) {
    console.error('workflow bootstrap failed', error)
    return JSON.stringify({ active: false }).replaceAll('<', '\\u003c')
  }
}

export const planBootstrap = createServerFn({ method: 'POST' })
  .validator((source: string) => source)
  .handler(async ({ data }) => ({ bootstrap: await workflowBootstrap(data) }))

export const openSample = createServerFn({ method: 'POST' }).handler(async () => {
  const request = getRequest()
  const [{ handleHostRequest }, { env }] = await workerAndEnv()
  const sampleModule = await import('../examples/rate-limit.plan.md?raw')
  const response = await handleHostRequest(
    new Request(new URL('/api/plans', request.url), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: request.headers.get('cookie') ?? '',
      },
      body: JSON.stringify({
        cloudId: SAMPLE_ID,
        title: 'Rate limiting rollout',
        markdown: sampleModule.default,
        mode: 'watch',
      }),
    }),
    env,
  )
  if (!response.ok) {
    return { ok: false as const, status: response.status, message: await response.text() }
  }
  const body = (await response.json()) as { plan: { id: string } }
  return { ok: true as const, id: body.plan.id }
})
