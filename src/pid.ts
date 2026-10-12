/** `kill(pid, 0)` probes liveness. EPERM means the process exists but is owned by someone else. */
export function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : ''
    return code === 'EPERM'
  }
}
