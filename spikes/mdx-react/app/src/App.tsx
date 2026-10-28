import { HostBar } from './HostBar'
import { PlanSlot } from './PlanSlot'
import { usePlanStream } from './usePlanStream'

export function App() {
  const stream = usePlanStream()
  return (
    <div className="host">
      <HostBar
        connected={stream.connected}
        plans={stream.plans}
        openPlan={stream.openPlan}
        snapshots={stream.openSnapshots}
        error={stream.error}
        onOpen={stream.open}
        onEdit={stream.edit}
        onRestore={stream.restore}
        onCreate={() => stream.create('Untitled plan', '# Untitled plan\n\n')}
      />
      <PlanSlot
        plan={stream.openPlan}
        snapshots={stream.openSnapshots}
        connected={stream.connected}
        onEdit={stream.edit}
        onRestore={stream.restore}
        onCreate={stream.create}
      />
    </div>
  )
}
