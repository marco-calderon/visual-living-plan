import { createFileRoute, redirect } from '@tanstack/react-router'
import { HostBar } from '../HostBar.tsx'
import { loadHistory } from '../planFns.ts'

export const Route = createFileRoute('/plans_/$planId/history')({
  loader: async ({ params }) => {
    const result = await loadHistory({ data: params.planId })
    if (!result.ok) {
      if (result.status === 401) {
        throw redirect({
          to: '/login',
          search: { next: `/plans/${params.planId}/history` },
        })
      }
      throw new Error(result.message)
    }
    return result.history
  },
  component: HistoryPage,
})

function HistoryPage() {
  const history = Route.useLoaderData()
  return (
    <>
      <HostBar title={history.title} label={history.name} />
      <main className="host-page">
        <section className="card">
          <h1>{history.title}</h1>
          <p>The latest 10 published versions of this plan. Publishing another drops the oldest.</p>
          {history.versions.length ? (
            <ul>
              {history.versions.map((version) => (
                <li key={version.seq}>
                  <a href={`/plans/${history.planId}/versions/${version.seq}`}>Version {version.seq}</a>
                  <span>{new Date(version.createdAt).toISOString()}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>No version is stored yet. Publish the plan from the machine that hosts the file.</p>
          )}
          <p>
            <a href={`/plans/${history.planId}`}>Open the live plan</a>
          </p>
        </section>
      </main>
    </>
  )
}
