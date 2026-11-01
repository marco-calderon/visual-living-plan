import { Button } from './ui/button.tsx'
import { Kbd } from './ui/Kbd.tsx'

export type CommentToggleProps = {
  enabled: boolean
  onToggle: () => void
}

export function CommentToggle({ enabled, onToggle }: CommentToggleProps) {
  return (
    <Button
      type="button"
      className="plan-grab-toggle"
      data-plan-grab-ignore=""
      aria-pressed={enabled}
      aria-label={enabled ? 'Turn comments off' : 'Turn comments on'}
      onClick={onToggle}
    >
      Comment
      <Kbd aria-hidden="true">C</Kbd>
    </Button>
  )
}
