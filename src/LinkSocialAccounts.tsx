import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '../client/ui/button.tsx'
import {
  LINKABLE_PROVIDERS,
  linkAccountErrorMessage,
  linkSocialRequest,
  providerIsLinked,
  providerLabel,
  type LinkableProvider,
} from './accountLinking.ts'
import { authClient } from './authClient.ts'
import { OAuthMark } from './OAuthMark.tsx'

type LinkSocialAccountsProps = {
  email: string
  accounts: ReadonlyArray<{ providerId: string }>
  errorCode?: string
}

/** Hosted settings controls that link GitHub or Google to the signed-in email account. */
export function LinkSocialAccounts({ email, accounts, errorCode }: LinkSocialAccountsProps) {
  const [pending, setPending] = useState<LinkableProvider | null>(null)
  const link = useMutation({
    mutationFn: (provider: LinkableProvider) => authClient.linkSocial(linkSocialRequest(provider, email)),
  })
  const [error, setError] = useState(() => linkAccountErrorMessage(errorCode))

  async function start(provider: LinkableProvider) {
    if (providerIsLinked(accounts, provider) || pending) return
    setError('')
    setPending(provider)
    const result = await link.mutateAsync(provider).catch((cause: unknown) => ({
      error: { message: cause instanceof Error ? cause.message : '' },
    }))
    if (result.error) {
      setPending(null)
      setError(result.error.message || 'Could not link that provider. Try again.')
    }
  }

  return (
    <section className="block settings-section" data-link-accounts="" data-host-panel="cloud">
      <h3>Linked accounts</h3>
      <p className="settings-copy">
        Link GitHub or Google to <strong>{email}</strong>. The provider has to use that same email. A different email is
        not attached.
      </p>
      <div className="settings-link-actions">
        {LINKABLE_PROVIDERS.map((provider) => {
          const linked = providerIsLinked(accounts, provider)
          const name = providerLabel(provider)
          return (
            <Button
              key={provider}
              type="button"
              variant="tertiary"
              data-link-provider={provider}
              disabled={linked || pending !== null}
              onClick={() => void start(provider)}
            >
              <OAuthMark provider={provider} />
              {linked ? `${name} linked` : `Link ${name}`}
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
