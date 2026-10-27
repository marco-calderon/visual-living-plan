/** Hash for the plan section a workflow node or in-plan reference points at. */
export function planRefHash(ref: string): string {
  return `#${encodeURIComponent(`plan-${ref}`)}`
}
