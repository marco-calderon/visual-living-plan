import handler from '@tanstack/react-start/server-entry'
import worker, { PlanObject, type Env as CloudEnv } from '../cloud/src/worker.ts'
import { faviconFromAsset } from './favicon.ts'
import { planIdFromPath, tanstackPage } from './pageRoutes.ts'

export { PlanObject }

type StartEnv = CloudEnv

export default {
  async fetch(request: Request, env: StartEnv): Promise<Response> {
    const upgrade = request.headers.get('upgrade')
    const url = new URL(request.url)
    if (!upgrade && url.pathname.startsWith('/client/')) {
      return new Response(null, { status: 404 })
    }
    if (!upgrade && url.pathname === '/favicon.png') return serveFavicon(request, env)
    const page = upgrade ? null : tanstackPage(url.pathname, request.method)
    if (!page) return worker.fetch(request, env)
    if (page === 'plan') {
      const id = planIdFromPath(url.pathname)
      if (id && url.pathname.endsWith('/')) {
        url.pathname = `/plans/${id}`
        request = new Request(url, request)
      }
    } else if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.replace(/\/+$/, '') || '/'
      request = new Request(url, request)
    }
    return handler.fetch(request)
  },
}

async function serveFavicon(request: Request, env: StartEnv): Promise<Response> {
  let asset: Response | null = null
  try {
    asset = await env.ASSETS.fetch(request)
  } catch {
    asset = null
  }
  return faviconFromAsset(asset)
}
