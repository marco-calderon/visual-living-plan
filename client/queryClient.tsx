import { MutationObserver, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { UserMutationKind } from '../src/offlineSync.ts'
import { postPlanMutation, type PlanPostResult } from './offline/engine.ts'

/**
 * Every browser request from a React component goes through React Query.
 * Polling queries stop while the tab is hidden (`refetchIntervalInBackground: false`)
 * and refresh once when it is shown again (`refetchOnWindowFocus`).
 */
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: true,
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

let browserClient: QueryClient | undefined

/**
 * One client per page, shared by the app route tree and the chrome islands mounted with their own
 * React roots, so they share one cache. The server gets a fresh client per render.
 */
export function sharedQueryClient(): QueryClient {
  if (typeof window === 'undefined') return createQueryClient()
  browserClient ??= createQueryClient()
  return browserClient
}

export function QueryProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={sharedQueryClient()}>{children}</QueryClientProvider>
}

type PlanMutationInput = { kind: UserMutationKind; path: string; body: unknown }

/**
 * Send one plan form, review, mode, or comment change as a React Query mutation.
 * `networkMode: 'always'` lets it run offline too: the device outbox queues it and sends it later.
 */
export function sendPlanMutation(kind: UserMutationKind, path: string, body: unknown): Promise<PlanPostResult> {
  const observer = new MutationObserver<PlanPostResult, Error, PlanMutationInput>(sharedQueryClient(), {
    mutationKey: ['plan-mutation', kind],
    mutationFn: (input) => postPlanMutation(input.kind, input.path, input.body),
    networkMode: 'always',
  })
  return observer.mutate({ kind, path, body })
}
