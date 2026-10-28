import type { ReactNode } from 'react'
import type { PlanHostProps } from '../../server/protocol'

type PlanModule = {
  PlanRoot?: (props: PlanHostProps) => ReactNode
}

const planModules = import.meta.glob<PlanModule>(['../../ui/index.tsx', '../../ui/index.ts'], { eager: true })

function loadPlanRoot(): PlanModule['PlanRoot'] {
  for (const module of Object.values(planModules)) {
    if (typeof module?.PlanRoot === 'function') return module.PlanRoot
  }
  return undefined
}

type PlanSlotProps = PlanHostProps

export function PlanSlot(props: PlanSlotProps) {
  const PlanRoot = loadPlanRoot()
  return (
    <div
      className="plan-slot"
      data-plan-root=""
      data-plan-id={props.plan?.id ?? ''}
      data-snapshot-id={props.plan?.headSnapshotId ?? ''}
    >
      {PlanRoot ? <PlanRoot {...props} /> : null}
    </div>
  )
}
