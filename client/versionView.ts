type VersionWindow = Window & { __LIVE_PLAN_VERSION__?: number }

/** The saved version this page shows, or null on the live plan. A version page is read-only and does not follow the live plan. */
export function viewingPlanVersion(): number | null {
  if (typeof window === 'undefined') return null
  const seq = (window as VersionWindow).__LIVE_PLAN_VERSION__
  return typeof seq === 'number' && Number.isInteger(seq) && seq > 0 ? seq : null
}
