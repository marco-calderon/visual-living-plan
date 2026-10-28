import type { PlanHostProps } from '../../server/protocol'
import { PlanDocument } from './PlanDocument'

type PlanSlotProps = PlanHostProps

export function PlanSlot(props: PlanSlotProps) {
  return (
    <div
      className="plan-slot"
      data-plan-root=""
      data-plan-id={props.plan?.id ?? ''}
      data-snapshot-id={props.plan?.headSnapshotId ?? ''}
    >
      {props.plan ? <PlanDocument body={props.plan.body} /> : null}
    </div>
  )
}
