import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'

const SAMPLE_ID = 'rate-limit-sample'

export const loadPlan = createServerFn({ method: 'GET' })
  .validator((planId: string) => planId)
  .handler(async ({ data: planId }) => {
    const request = getRequest()
    const [{ hostedPlanPage }, { env }] = await Promise.all([
      import('../../cloud/src/worker.ts'),
      import('cloudflare:workers'),
    ])
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
      accent: string
      pageWidth: 'default' | 'wide' | 'full'
      diffsTheme: string
      wrapCode: boolean
    }
    return { ok: true as const, page }
  })

export const openSample = createServerFn({ method: 'POST' })
  .handler(async () => {
    const request = getRequest()
    const [{ default: worker }, { env }, sampleModule] = await Promise.all([
      import('../../cloud/src/worker.ts'),
      import('cloudflare:workers'),
      import('../../examples/rate-limit.plan.md?raw'),
    ])
    const response = await worker.fetch(
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
