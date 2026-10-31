import { createFileRoute, redirect } from '@tanstack/react-router'
import { openSample } from '../planFns.ts'
import '../hostToolbar.css'

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
  component: SamplePage,
})

function SamplePage() {
  return (
    <>
      <header className="titlebar">
        <a className="logo-btn" href="/dashboard" aria-label="Living Plan">
          <img className="titlebar-logo" src="/favicon.png" alt="" width={29} height={29} />
        </a>
        <h1 className="brand">Living Plan</h1>
      </header>
      <main className="account-card">
        <p>Opening the sample plan…</p>
      </main>
    </>
  )
}
