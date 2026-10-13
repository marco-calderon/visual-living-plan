export type CommentToggleProps = {
  enabled: boolean
  onToggle: () => void
}

export function CommentToggle({ enabled, onToggle }: CommentToggleProps) {
  return (
    <button
      type="button"
      className="plan-grab-toggle"
      data-plan-grab-ignore=""
      aria-pressed={enabled}
      aria-label={enabled ? 'Turn comments off' : 'Turn comments on'}
      onClick={onToggle}
    >
      Comment
    </button>
  )
}
