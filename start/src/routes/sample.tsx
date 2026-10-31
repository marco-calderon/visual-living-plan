import { createFileRoute, redirect } from '@tanstack/react-router'
import { openSample } from '../planFns.ts'

export const Route = createFileRoute('/sample')({
  loader: async () => {
    const result = await openSample()
    if (!result.ok) {
      throw redirect({
        to: '/login',
        search: { next: '/sample' },
      })
    }
    throw redirect({ to: '/plans/$planId', params: { planId: result.id } })
  },
  component: () => <p className="account-card">Opening the sample plan…</p>,
})
