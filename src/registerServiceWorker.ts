export const SHELL_WORKER_URL = '/sw.js'

type ServiceWorkerContainerLike = {
  register: (scriptURL: string, options?: { scope?: string; type?: 'classic' | 'module' }) => Promise<unknown>
}

export type ServiceWorkerHost = {
  location: { protocol: string; hostname: string }
  navigator: { serviceWorker?: ServiceWorkerContainerLike }
  document: { readyState: string }
  addEventListener: (type: string, listener: () => void, options?: { once?: boolean }) => void
}

/** Registers the shell worker from a browser entry. No-ops during SSR and outside a secure context. */
export function registerServiceWorker(host: ServiceWorkerHost | null = browserHost()): void {
  const container = host?.navigator.serviceWorker
  if (!host || !container || !securePage(host)) return
  const register = () => {
    void container.register(SHELL_WORKER_URL, { scope: '/', type: 'module' }).catch(() => undefined)
  }
  if (host.document.readyState === 'complete') register()
  else host.addEventListener('load', register, { once: true })
}

function securePage(host: ServiceWorkerHost): boolean {
  if (host.location.protocol === 'https:') return true
  const hostname = host.location.hostname
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

function browserHost(): ServiceWorkerHost | null {
  const win = (globalThis as { window?: ServiceWorkerHost }).window
  if (!win?.document || !win.navigator || !win.location || !win.addEventListener) return null
  return win
}
