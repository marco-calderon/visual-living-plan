import { Button } from '../client/ui/button.tsx'
import { authClient } from './authClient.ts'
import { authPath, authReturnPath, finishAuth, type AuthSearch } from './authSearch.ts'

type SocialProvider = 'github' | 'google'

type SocialAuthButtonProps = {
  provider: SocialProvider
  search: AuthSearch
  intent: 'sign-in' | 'sign-up'
  pending: boolean
  onPending: (pending: boolean) => void
  onError: (message: string) => void
}

const NAME: Record<SocialProvider, string> = {
  github: 'GitHub',
  google: 'Google',
}

/** Secondary pill that starts GitHub or Google OAuth. The Worker reads each client id and secret from its environment. */
export function SocialAuthButton({ provider, search, intent, pending, onPending, onError }: SocialAuthButtonProps) {
  const page = intent === 'sign-up' ? '/signup' : '/login'
  const label = `Continue with ${NAME[provider]}`

  async function start() {
    onError('')
    onPending(true)
    const result = await authClient.signIn.social({
      provider,
      callbackURL: authReturnPath(search),
      errorCallbackURL: authPath(page, search),
      requestSignUp: intent === 'sign-up',
    })
    if (result.error) {
      onPending(false)
      onError(result.error.message || `${NAME[provider]} sign-in failed`)
      return
    }
    if (!result.data?.url) {
      onPending(false)
      finishAuth(search)
    }
  }

  return (
    <Button type="button" variant="secondary" disabled={pending} onClick={() => void start()}>
      {label}
    </Button>
  )
}
