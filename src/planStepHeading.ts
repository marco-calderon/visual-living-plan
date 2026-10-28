/** Split a leading "7. Title" into the step number and the label under it. */
export function splitStepHeading(title: string): { number: string | null; label: string } {
  const match = /^(\d+)\.\s+([\s\S]+)$/.exec(title.trim())
  if (!match?.[1] || !match[2]) return { number: null, label: title }
  return { number: match[1], label: match[2].trim() }
}

export function stepNumberFor(title: string, ordinal: number): { number: string; label: string } {
  const split = splitStepHeading(title)
  return {
    number: split.number ?? String(Math.max(1, ordinal)),
    label: split.label,
  }
}

/** Same spinner the workflow diagram draws beside an active step. */
export function activeStepSpinnerHtml(): string {
  return '<svg class="rf-progress-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="2" opacity="0.28"></circle><path d="M14 8a6 6 0 0 0-6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path></svg>'
}
