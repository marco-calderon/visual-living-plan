import handler from '@tanstack/react-start/server-entry'
import worker, { PlanObject, type Env as CloudEnv } from '../../cloud/src/worker.ts'
import { planIdFromPath, tanstackPage } from './delegate.ts'

export { PlanObject }

type StartEnv = CloudEnv

export default {
  async fetch(request: Request, env: StartEnv): Promise<Response> {
    const upgrade = request.headers.get('upgrade')
    const url = new URL(request.url)
    if (!upgrade && url.pathname.startsWith('/client/')) {
      return new Response(null, { status: 404 })
    }
    if (!upgrade && url.pathname === '/favicon.png') return handler.fetch(request)
    const page = upgrade ? null : tanstackPage(url.pathname, request.method)
    if (!page) return withAccountMenu(await worker.fetch(request, env))
    if (page === 'plan') {
      const id = planIdFromPath(url.pathname)
      if (id && url.pathname.endsWith('/')) {
        url.pathname = `/plans/${id}`
        request = new Request(url, request)
      }
    } else if (url.pathname.endsWith('/')) {
      url.pathname = url.pathname.replace(/\/+$/, '') || '/'
      request = new Request(url, request)
    }
    return handler.fetch(request)
  },
}

async function withAccountMenu(response: Response): Promise<Response> {
  const type = response.headers.get('content-type') ?? ''
  if (!type.includes('text/html')) return response
  const html = await response.text()
  if (!html.includes('data-account-menu') || html.includes('bootAccountMenu')) {
    return new Response(html, response)
  }
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  return new Response(html.replace('</body>', '<script type="module" src="/src/bootAccountMenu.ts"></script></body>'), {
    status: response.status,
    headers,
  })
}
