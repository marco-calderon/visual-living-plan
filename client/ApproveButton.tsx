import { Button } from './ui/button.tsx'

export type ApproveButtonProps = {
  onApprove: () => void
}

export function ApproveButton({ onApprove }: ApproveButtonProps) {
  return (
    <Button type="button" className="plan-approve-button" data-plan-grab-ignore="" onClick={onApprove}>
      Approve
    </Button>
  )
}
