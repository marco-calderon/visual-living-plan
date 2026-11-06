import { useQuery } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../client/ui/button.tsx'
import { HostBar } from '../HostBar.tsx'
import { cliLoginCommand, mintCliToken } from '../cliToken.ts'
import { loadAccount } from '../planFns.ts'

/** The page `live-plan account login --headless` prints. It shows a token to paste into a terminal with no browser. */
export const Route = createFileRoute('/cli-token')({
  loader: async () => {
    const result = await loadAccount()
    if (!result.ok) {
      throw redirect({ to: '/login', search: { next: '/cli-token' } })
    }
    return result.account
  },
  component: CliTokenPage,
})

function CliTokenPage() {
  const account = Route.useLoaderData()
  const label = account.user.name || account.user.email
  // One token per visit. A refocus or remount must not mint another.
  const minted = useQuery({
    queryKey: ['cli-token'],
    queryFn: () => mintCliToken(),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  return (
    <>
      <HostBar title="Terminal sign-in" label={label} />
      <main className="host-page">
        <section className="card">
          <h1>Sign in a terminal</h1>
          <p>
            Signed in as {account.user.email}. Copy this command and run it on the machine that has no browser, such as
            a VM or a cloud agent.
          </p>
          {minted.isPending ? <p className="meta">Making a token…</p> : null}
          {minted.isError ? (
            <p className="account-error" role="alert">
              {minted.error.message}
            </p>
          ) : null}
          {minted.data ? <TokenCommand command={cliLoginCommand(minted.data.url, minted.data.token)} /> : null}
          {minted.data ? (
            <p className="meta">
              The token works until <strong>{new Date(minted.data.expiresAt).toLocaleDateString()}</strong>. Treat it
              like a password. Opening this page again makes a new one.
            </p>
          ) : null}
        </section>
      </main>
    </>
  )
}

function TokenCommand({ command }: { command: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  return (
    <div className="cli-token">
      <pre>
        <code data-testid="cli-token-command">{command}</code>
      </pre>
      <Button
        variant="primary"
        onClick={() => {
          void navigator.clipboard.writeText(command).then(
            () => setState('copied'),
            () => setState('failed'),
          )
        }}
      >
        {state === 'copied' ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed, select the text' : 'Copy command'}
      </Button>
    </div>
  )
}
