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

const STATUS_ICON_PATHS: Record<string, string> = {
  done: '<circle cx="12" cy="12" r="10"></circle><path d="m16 9-5.5 5.5L8 12"></path>',
  failed: '<circle cx="12" cy="12" r="10"></circle><path d="m15 9-6 6"></path><path d="m9 9 6 6"></path>',
  blocked: '<circle cx="12" cy="12" r="10"></circle><path d="M4.929 4.929 19.07 19.071"></path>',
  pending:
    '<path d="M10.1 2.182a10 10 0 0 1 3.8 0"></path><path d="M13.9 21.818a10 10 0 0 1-3.8 0"></path><path d="M17.609 3.721a10 10 0 0 1 2.69 2.7"></path><path d="M2.182 13.9a10 10 0 0 1 0-3.8"></path><path d="M20.279 17.609a10 10 0 0 1-2.7 2.69"></path><path d="M21.818 10.1a10 10 0 0 1 0 3.8"></path><path d="M3.721 6.391a10 10 0 0 1 2.7-2.69"></path><path d="M6.391 20.279a10 10 0 0 1-2.69-2.7"></path>',
}

/**
 * Status icon for static plan HTML. Matches the lucide icons `StatusIcon`
 * draws in the app (CircleCheck, CircleX, Ban, CircleDashed) and the spinner.
 */
export function stepStatusIconHtml(status: string): string {
  if (status === 'active') return activeStepSpinnerHtml()
  const paths = STATUS_ICON_PATHS[status] ?? STATUS_ICON_PATHS.pending
  return `<svg class="status-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`
}

/** Same spinner the workflow diagram draws beside an active step. */
export function activeStepSpinnerHtml(): string {
  return '<svg class="rf-progress-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="2" opacity="0.28"></circle><path d="M14 8a6 6 0 0 0-6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path></svg>'
}
