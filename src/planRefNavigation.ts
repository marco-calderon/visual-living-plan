/** Hash for the plan section a workflow node or in-plan reference points at. */
export function planRefHash(ref: string): string {
  return `#${encodeURIComponent(`plan-${ref}`)}`
}

/** Hash for the workflow diagram step a plan phase points at. */
export function workflowStepHash(ref: string): string {
  return `#workflow/${encodeURIComponent(ref)}`
}
