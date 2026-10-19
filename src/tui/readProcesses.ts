import type { ProcessRecord } from '../processRecord'

function isProcessList(value: unknown): value is ProcessRecord[] {
  if (!Array.isArray(value)) return false
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const record = entry as Partial<ProcessRecord>
    return typeof record.id === 'string' && record.id.length > 0 && typeof record.url === 'string'
  })
}

/** The registry home reads `GET /api/processes`. The terminal view uses that same response. */
export async function readProcesses(registryUrl: string): Promise<ProcessRecord[]> {
  const response = await fetch(new URL('/api/processes', registryUrl), { cache: 'no-store' })
  if (!response.ok) {
    throw new Error('Could not read the registry.')
  }
  const payload: unknown = await response.json()
  const processes = payload && typeof payload === 'object' ? (payload as { processes?: unknown }).processes : undefined
  if (!isProcessList(processes)) {
    throw new Error('Could not read the registry.')
  }
  return processes
}
