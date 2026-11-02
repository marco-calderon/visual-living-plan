import { useEffect, useState } from 'react'
import { Button } from '../client/ui/button.tsx'
import { authClient } from './authClient.ts'

type SocialProvider = 'github' | 'google'

type LinkedProvidersProps = {
  linkError?: string
}

const PROVIDERS: { id: SocialProvider; name: string }[] = [
  { id: 'github', name: 'GitHub' },
  { id: 'google', name: 'Google' },
]

/** Sentence for an OAuth link failure that returns to settings. */
export function linkProviderMessage(code: string | undefined): string {
  if (code === 'email_does_not_match') return 'That provider uses a different email than this account.'
  if (code === 'account_already_linked_to_different_user') return 'That provider is already linked to another account.'
  return 'Could not link that provider. Try again.'
}

function buttonLabel(name: string, linked: boolean): string {
  return linked ? `${name} linked` : `Link ${name}`
}

/** Hosted settings controls that attach GitHub or Google to the signed-in account. */
export function LinkedProviders({ linkError }: LinkedProvidersProps) {
  const [linked, setLinked] = useState<Set<string>>(() => new Set())
  const [ready, setReady] = useState(false)
  const [pending, setPending] = useState<SocialProvider | null>(null)
  const [error, setError] = useState(linkError ? linkProviderMessage(linkError) : '')

  useEffect(() => {
    let cancel = false
    void (async () => {
      const result = await authClient.listAccounts()
      if (cancel) return
      if (result.error || !result.data) {
        setReady(true)
        setError((current) => current || 'Could not check linked providers.')
        return
      }
      setLinked(new Set(result.data.map((account) => account.providerId)))
      setReady(true)
    })()
    return () => {
      cancel = true
    }
  }, [])

  async function link(provider: SocialProvider) {
    if (!ready || pending || linked.has(provider)) return
    const name = PROVIDERS.find((item) => item.id === provider)?.name ?? provider
    setError('')
    setPending(provider)
    const result = await authClient.linkSocial({
      provider,
      callbackURL: '/settings',
      errorCallbackURL: '/settings',
    })
    if (result.error) {
      setPending(null)
      setError(result.error.message || `Could not link ${name}.`)
      return
    }
    if (result.data?.redirect && result.data.url) return
    setLinked((current) => new Set(current).add(provider))
    setPending(null)
  }

  return (
    <section className="block settings-section" data-linked-providers="" aria-busy={!ready || pending !== null}>
      <h3>Sign-in providers</h3>
      <p className="settings-copy">
        Link GitHub or Google to this account. The email on that provider has to match this account.
      </p>
      <div className="settings-provider-actions">
        {PROVIDERS.map((provider) => {
          const isLinked = linked.has(provider.id)
          const disabled = !ready || pending !== null || isLinked
          return (
            <Button
              key={provider.id}
              type="button"
              variant="secondary"
              data-provider={provider.id}
              data-linked={isLinked ? 'true' : 'false'}
              disabled={disabled}
              onClick={() => void link(provider.id)}
            >
              {buttonLabel(provider.name, isLinked)}
            </Button>
          )
        })}
      </div>
      {error ? (
        <p className="settings-meta settings-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}
