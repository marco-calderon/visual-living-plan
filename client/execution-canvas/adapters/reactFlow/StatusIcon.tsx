import { Ban, CircleCheck, CircleDashed, CircleX } from 'lucide-react'
import type { ExecutionNodeStatus } from '../../../../src/execution.ts'
import { ProgressIcon } from './ProgressIcon.tsx'

const STATUS_LABEL: Record<ExecutionNodeStatus, string> = {
  pending: 'Pending',
  active: 'Active',
  done: 'Done',
  failed: 'Failed',
  blocked: 'Blocked',
}

export function statusLabel(status: ExecutionNodeStatus): string {
  return STATUS_LABEL[status] ?? status
}

/** Status as an icon. The caller gives the wrapper its accessible name. */
export function StatusIcon({ status, size = 16 }: { status: ExecutionNodeStatus; size?: number }) {
  const props = { size, strokeWidth: 2.25, 'aria-hidden': true, focusable: false, className: 'status-icon' } as const
  switch (status) {
    case 'active':
      return <ProgressIcon />
    case 'done':
      return <CircleCheck {...props} />
    case 'failed':
      return <CircleX {...props} />
    case 'blocked':
      return <Ban {...props} />
    default:
      return <CircleDashed {...props} />
  }
}
