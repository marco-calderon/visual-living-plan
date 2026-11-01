import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import type { DashboardPeriod, DashboardSummary } from '../dashboard.ts'
import {
  completionLabel,
  dashboardStatusLine,
  formatDuration,
  formatWhen,
  periodIndex,
  safeHttpUrl,
  statusLabel,
  visiblePlans,
  type DashboardFilter,
} from '../dashboardFormat.ts'
import { Button } from '../../client/ui/button.tsx'
import { HostBar } from '../HostBar.tsx'
import { loadAccount } from '../planFns.ts'
import type { PlanRecord } from '../processRecord.ts'
import './dashboard.css'

const LEDE =
  'Hosted plans for this account. Summaries follow the local day, week, and month. Each published version is stored on this host, and the latest 10 are kept. Loopback plans stay on your machine.'

const PERIODS: Array<{ id: DashboardPeriod; label: string; aria?: string }> = [
  { id: 'day', label: 'Today' },
  { id: 'week', label: 'Week', aria: 'This week' },
  { id: 'month', label: 'Month', aria: 'This month' },
]

const FILTERS: Array<{ id: DashboardFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'running', label: 'Running' },
  { id: 'executed', label: 'Executed' },
  { id: 'interrupted', label: 'Interrupted' },
]

type DashboardSearch = { period?: DashboardPeriod }

type DashboardPlan = PlanRecord & { fileUrl?: string; historyUrl?: string }

type DashboardBody = {
  summary: DashboardSummary
  plans: DashboardPlan[]
}

type Shift = 'enter' | 'forward' | 'back' | 'filter' | 'quiet'

export const Route = createFileRoute('/dashboard')({
  validateSearch: (search: Record<string, unknown>): DashboardSearch => {
    const period = search.period
    if (period === 'day' || period === 'week' || period === 'month') return { period }
    return {}
  },
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
  const search = Route.useSearch()
  const navigate = useNavigate()
  const period = search.period ?? 'day'
  const [filter, setFilter] = useState<DashboardFilter>('all')
  const [payload, setPayload] = useState<DashboardBody | null>(null)
  const [error, setError] = useState('')
  const [shift, setShift] = useState<Shift>('enter')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const response = await fetch(`/api/account/dashboard?period=${encodeURIComponent(period)}`, { cache: 'no-store' })
        if (!response.ok) throw new Error('Request failed')
        const next = (await response.json()) as DashboardBody
        if (cancelled) return
        setPayload(next)
        setError('')
      } catch {
        if (!cancelled) setError('Could not read the dashboard.')
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), 4000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [period, reload])

  useEffect(() => {
    if (!payload || shift === 'quiet') return
    const timer = window.setTimeout(() => setShift('quiet'), 240)
    return () => window.clearTimeout(timer)
  }, [payload, shift])

  function choosePeriod(next: DashboardPeriod) {
    if (next === period) return
    setShift(periodIndex(next) > periodIndex(period) ? 'forward' : 'back')
    void navigate({ to: '/dashboard', search: { period: next }, replace: true })
  }

  function chooseFilter(next: DashboardFilter) {
    if (next === filter) return
    setShift('filter')
    setFilter(next)
  }

  const plans = payload?.plans ?? []
  const shown = visiblePlans(plans, filter)
  const status = error || (payload ? dashboardStatusLine(payload.summary, shown.length, filter) : 'Loading…')

  return (
    <>
      <HostBar title="Dashboard" label={account.user.name || account.user.email} />
      <main className="dashboard">
        <div className="dashboard-live" data-shift={shift}>
          <section className="dash-section" aria-label="Summary">
            <div className="section-bar">
              <div className="tabs" role="group" aria-label="Summary period">
                {PERIODS.map((item) => (
                  <Button
                    key={item.id}
                    type="button"
                    className="tab-label"
                    aria-pressed={period === item.id}
                    aria-label={item.aria}
                    onClick={() => choosePeriod(item.id)}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
              <Button
                type="button"
                variant="secondary"
                className="titlebar-action"
                onClick={() => {
                  setShift('filter')
                  setReload((value) => value + 1)
                }}
              >
                Refresh
              </Button>
            </div>
            <section className="stats" aria-live="polite">
              {payload ? (
                <>
                  <Stat label="Running" value={String(payload.summary.running)} />
                  <Stat label="Executed" value={String(payload.summary.executed)} />
                  <Stat label="Interrupted" value={String(payload.summary.interrupted)} />
                  <Stat label="Files modified" value={String(payload.summary.filesModified)} />
                  <Stat label="Execution time" value={formatDuration(payload.summary.durationMs)} />
                  <Stat label="Folders" value={String(payload.summary.folders)} />
                </>
              ) : null}
            </section>
            <p className="lede">{LEDE}</p>
            <p className="status">{status}</p>
          </section>
          <section className="dash-section" aria-label="Plans">
            <div className="section-bar">
              <div className="tabs" role="group" aria-label="Plan status">
                {FILTERS.map((item) => (
                  <Button
                    key={item.id}
                    type="button"
                    className="tab-label"
                    aria-pressed={filter === item.id}
                    onClick={() => chooseFilter(item.id)}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <caption>Plans</caption>
                <thead>
                  <tr>
                    <th scope="col">Plan</th>
                    <th scope="col">Status</th>
                    <th scope="col">Completion</th>
                    <th scope="col">Folder</th>
                    <th scope="col">Files</th>
                    <th scope="col">Started</th>
                    <th scope="col">Duration</th>
                    <th scope="col" />
                  </tr>
                </thead>
                <tbody>
                  {payload && shown.length === 0 ? (
                    <tr>
                      <td className="empty" colSpan={8}>
                        No plans in this view.
                      </td>
                    </tr>
                  ) : (
                    shown.map((plan) => <PlanRow key={plan.id} plan={plan} />)
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <article className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function BrokenPath({ value, className }: { value: string; className: string }) {
  const parts = value.split('/')
  return (
    <span className={className}>
      {parts.map((part, index) => (
        <span key={`${index}-${part}`}>
          {index > 0 ? (
            <>
              /
              <wbr />
            </>
          ) : null}
          {part}
        </span>
      ))}
    </span>
  )
}

function PlanRow({ plan }: { plan: DashboardPlan }) {
  const bits = [plan.mode || 'watch']
  if (plan.executionStep) bits.push(plan.executionStep)
  if (plan.outcome) bits.push(plan.outcome)
  const ratio = Math.max(0, Math.min(100, Number(plan.completionRatio) || 0))
  const openUrl = plan.status === 'running' ? safeHttpUrl(plan.url) : ''
  const fileUrl = plan.storedPath && plan.id ? plan.fileUrl || `/archive/${encodeURIComponent(plan.id)}` : ''
  return (
    <tr>
      <td>
        <span className="title">{plan.title || 'Untitled plan'}</span>
        <span className="sub">{bits.join(' · ')}</span>
        {plan.planPath ? <BrokenPath className="sub path" value={plan.planPath} /> : null}
      </td>
      <td>
        <span className={`pill ${plan.status || 'running'}`}>{statusLabel(plan.status)}</span>
        {plan.status === 'running' ? <span className="sub">{plan.pendingCount} pending</span> : null}
      </td>
      <td>
        <div className="meter">
          <span style={{ width: `${ratio}%` }} />
        </div>
        <span className="sub">
          {ratio}% · {completionLabel(plan.completionState)}
        </span>
        <span className="sub">
          {plan.phaseDone}/{plan.phaseTotal} phases · {plan.interactionDone}/{plan.interactionTotal} answers
        </span>
      </td>
      <td>
        {plan.directory ? <BrokenPath className="path" value={plan.directory} /> : null}
        {plan.git?.branch ? (
          <span className="sub">
            {plan.git.branch} · {plan.git.dirty ? 'dirty' : 'clean'}
          </span>
        ) : null}
      </td>
      <td className="num">{plan.filesModified ?? 0}</td>
      <td className="num">{formatWhen(plan.startedAt)}</td>
      <td className="num">{formatDuration(plan.durationMs)}</td>
      <td>
        {openUrl ? (
          <a className="action" href={openUrl}>
            Open
          </a>
        ) : null}
        {fileUrl ? (
          <a className="action" href={fileUrl} title={plan.storedPath ?? undefined}>
            Plan file
          </a>
        ) : null}
        {plan.historyUrl ? (
          <a className="action" href={plan.historyUrl}>
            Versions
          </a>
        ) : null}
      </td>
    </tr>
  )
}
