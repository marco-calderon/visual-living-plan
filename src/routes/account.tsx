import { createFileRoute, redirect } from '@tanstack/react-router'
import { hostToolbarCss } from '../hostToolbar.ts'
import { HostBar } from '../HostBar.tsx'
import { loadAccount } from '../planFns.ts'

export const Route = createFileRoute('/account')({
  loader: async () => {
    const result = await loadAccount()
    if (!result.ok) {
      throw redirect({ to: '/login', search: { next: '/account' } })
    }
    return result.account
  },
  component: AccountPage,
})

function AccountPage() {
  const account = Route.useLoaderData()
  const label = account.user.name || account.user.email
  return (
    <>
      <style>{hostToolbarCss}</style>
      <HostBar title="Account" label={label} />
      <main className="host-page">
        <p className="kicker">Living Plan</p>
        <section className="card">
          <h1>Account</h1>
          <p>Signed in as {account.user.email}.</p>
          <p className="meta">
            Name <strong>{label}</strong>
          </p>
          <p className="meta">
            Tier <strong>{account.user.tier}</strong>
          </p>
          <p>
            If a terminal is waiting on account login, close this window and return to it. Host a plan from that machine
            with <code>live-plan serve path/to/work.plan.md --cloud</code>. Each publish stores the plan here. Loopback
            plans stay separate and do not require this account.
          </p>
          <p>
            <a href="/dashboard">Dashboard</a>
          </p>
        </section>
      </main>
    </>
  )
}
