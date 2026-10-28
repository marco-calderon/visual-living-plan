import { useEffect, useState } from 'react'
import type { PlanDocument, SnapshotRecord } from '../../server/protocol'

type HostBarProps = {
  connected: boolean
  plans: PlanDocument[]
  openPlan: PlanDocument | null
  snapshots: SnapshotRecord[]
  error: string | null
  onOpen: (planId: string) => void
  onEdit: (body: string, title?: string) => Promise<void>
  onRestore: (snapshotId: string) => Promise<void>
  onCreate: () => Promise<void>
}

export function HostBar(props: HostBarProps) {
  const { openPlan, snapshots } = props
  const [title, setTitle] = useState(openPlan?.title ?? '')
  const [body, setBody] = useState(openPlan?.body ?? '')
  const [picked, setPicked] = useState(openPlan?.headSnapshotId ?? '')

  useEffect(() => {
    setTitle(openPlan?.title ?? '')
    setBody(openPlan?.body ?? '')
  }, [openPlan?.id, openPlan?.headSnapshotId, openPlan?.title, openPlan?.body])

  const selected = snapshots.some((snapshot) => snapshot.id === picked)
    ? picked
    : openPlan?.headSnapshotId ?? ''

  const dirty = openPlan !== null && (title !== openPlan.title || body !== openPlan.body)
  const canRestore = selected !== '' && selected !== openPlan?.headSnapshotId

  return (
    <header className="host-bar">
      <div className="host-row">
        <p className="host-name">MDX plan</p>
        <p className="host-status" data-connected={props.connected ? 'true' : 'false'}>
          {props.connected ? 'Live' : 'Reconnecting'}
        </p>
      </div>
      <div className="host-row">
        <label>
          Plan
          <select
            data-plan-select
            value={openPlan?.id ?? ''}
            onChange={(event) => props.onOpen(event.target.value)}
          >
            {props.plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.title}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          data-create
          onClick={() => {
            void props.onCreate().catch(() => undefined)
          }}
        >
          New plan
        </button>
        <p className="host-count" data-snapshot-count={snapshots.length}>
          {snapshots.length} {snapshots.length === 1 ? 'snapshot' : 'snapshots'}
        </p>
      </div>
      <div className="host-row">
        <label>
          Snapshot
          <select data-snapshot-select value={selected} onChange={(event) => setPicked(event.target.value)}>
            {snapshots.map((snapshot) => (
              <option key={snapshot.id} value={snapshot.id}>
                {snapshot.seq}. {snapshot.reason}
                {snapshot.id === openPlan?.headSnapshotId ? ' (head)' : ''}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          data-restore
          disabled={!canRestore}
          onClick={() => {
            void props.onRestore(selected).catch(() => undefined)
          }}
        >
          Restore
        </button>
      </div>
      <ol className="snapshot-list" data-snapshot-list>
        {snapshots.map((snapshot) => (
          <li
            key={snapshot.id}
            data-snapshot-id={snapshot.id}
            data-head={snapshot.id === openPlan?.headSnapshotId ? 'true' : 'false'}
          >
            <span>{snapshot.seq}</span>
            <span>{snapshot.reason}</span>
            {snapshot.restoredFromId ? <span>from {snapshot.restoredFromId}</span> : null}
          </li>
        ))}
      </ol>
      <label className="host-title">
        Title
        <input data-plan-title value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label className="host-source">
        Source
        <textarea data-plan-source value={body} onChange={(event) => setBody(event.target.value)} rows={12} />
      </label>
      <div className="host-row">
        <button
          type="button"
          data-save
          disabled={!dirty}
          onClick={() => {
            void props.onEdit(body, title).catch(() => undefined)
          }}
        >
          Save snapshot
        </button>
        {dirty ? <p>Unsaved source</p> : <p>Head matches the source</p>}
      </div>
      {props.error ? (
        <p className="host-error" role="alert">
          {props.error}
        </p>
      ) : null}
    </header>
  )
}
