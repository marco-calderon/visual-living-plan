export const LINKABLE_PROVIDERS = ['github', 'google'] as const

export type LinkableProvider = (typeof LINKABLE_PROVIDERS)[number]

const PROVIDER_NAME: Record<LinkableProvider, string> = {
  github: 'GitHub',
  google: 'Google',
}

export type AccountLinkingConfig = {
  enabled: true
  trustedProviders: string[]
  allowDifferentEmails: false
  updateUserInfoOnLink: false
}

/** Trust only the providers this host is configured to run. A different email is never attached. */
export function accountLinkingConfig(providers: { github: boolean; google: boolean }): AccountLinkingConfig {
  const trustedProviders: string[] = []
  if (providers.github) trustedProviders.push('github')
  if (providers.google) trustedProviders.push('google')
  return {
    enabled: true,
    trustedProviders,
    allowDifferentEmails: false,
    updateUserInfoOnLink: false,
  }
}

export function providerIsLinked(accounts: ReadonlyArray<{ providerId: string }>, provider: string): boolean {
  return accounts.some((account) => account.providerId === provider)
}

export function providerLabel(provider: LinkableProvider): string {
  return PROVIDER_NAME[provider]
}

/** Where Better Auth returns after the signed-in user finishes or abandons linking. */
export function linkSocialRequest(provider: LinkableProvider, email: string) {
  return {
    provider,
    callbackURL: '/settings',
    errorCallbackURL: '/settings',
    loginHint: email,
  }
}

/** Map Better Auth's OAuth callback `error` codes. Unknown codes stay generic. */
export function linkAccountErrorMessage(code: string | undefined): string {
  if (!code) return ''
  if (code === 'email_does_not_match' || code === 'email_not_found') {
    return 'That provider email does not match this account, so it was not linked.'
  }
  if (code === 'account_already_linked_to_different_user') {
    return 'That provider account is already linked to someone else.'
  }
  return 'Could not link that provider. Try again.'
}
