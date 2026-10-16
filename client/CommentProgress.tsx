export type CommentProgressProps = {
  label?: string
}

export function CommentProgress({ label = 'Addressing' }: CommentProgressProps) {
  return (
    <span className="plan-comment-progress" role="img" aria-label={label} title={label}>
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.35" />
        <path
          d="M8 2.5a5.5 5.5 0 0 1 5.5 5.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </span>
  )
}
