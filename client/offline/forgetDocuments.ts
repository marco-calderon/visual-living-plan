/** Ask the shell worker to drop cached HTML. Assets stay. */
export function forgetCachedDocuments(paths?: readonly string[]): void {
  if (typeof navigator === 'undefined') return
  const worker = navigator.serviceWorker?.controller
  if (!worker) return
  worker.postMessage(paths ? { type: 'forget-documents', paths } : { type: 'forget-documents', all: true })
}
