import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect } from 'react'
import { dashboardClientScript } from '../dashboardClientScript.ts'
import { dashboardDocumentCss, dashboardMainHtml } from '../dashboardParts.ts'
import { HostBar } from '../HostBar.tsx'
import { loadAccount } from '../planFns.ts'

const LEDE =
  'Hosted plans for this account. Summaries follow the local day, week, and month. Each published version is stored on this host, and the latest 10 are kept. Loopback plans stay on your machine.'

export const Route = createFileRoute('/dashboard')({
  loader: async () => {
    const result = await loadAccount()
    if (!result.ok) {
      throw redirect({ to: '/login', search: { next: '/dashboard' } })
    }
    return result.account
  },
  component: DashboardPage,
})

function DashboardPage() {
  const account = Route.useLoaderData()
  useEffect(() => {
    const win = window as Window & { __livingPlanDashboardTimer?: number }
    if (win.__livingPlanDashboardTimer) clearInterval(win.__livingPlanDashboardTimer)
    document.getElementById('dashboard-runtime')?.remove()
    const script = document.createElement('script')
    script.id = 'dashboard-runtime'
    script.text = dashboardClientScript('/api/account/dashboard')
    document.body.appendChild(script)
    return () => {
      script.remove()
      if (win.__livingPlanDashboardTimer) clearInterval(win.__livingPlanDashboardTimer)
    }
  }, [])

  return (
    <>
      <style>{dashboardDocumentCss()}</style>
      <HostBar title="Dashboard" label={account.user.name || account.user.email} />
      <div dangerouslySetInnerHTML={{ __html: dashboardMainHtml(LEDE) }} />
    </>
  )
}
