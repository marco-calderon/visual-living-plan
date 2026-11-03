import { createFileRoute, redirect } from '@tanstack/react-router'

/** Old versions links land on the live plan. Versions are a menu on that plan. */
export const Route = createFileRoute('/plans_/$planId/history')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/plans/$planId', params: { planId: params.planId } })
  },
})
