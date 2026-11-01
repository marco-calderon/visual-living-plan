import { Button } from '../client/ui/button.tsx'
import { authClient } from './authClient.ts'
import { authPath, authReturnPath, finishAuth, type AuthSearch } from './authSearch.ts'

type GithubAuthButtonProps = {
  search: AuthSearch
  intent: 'sign-in' | 'sign-up'
  pending: boolean
  onPending: (pending: boolean) => void
  onError: (message: string) => void
}

/** Secondary pill that starts GitHub OAuth. The Worker reads the client id and secret from its environment. */
export function GithubAuthButton({ search, intent, pending, onPending, onError }: GithubAuthButtonProps) {
  const page = intent === 'sign-up' ? '/signup' : '/login'

  async function start() {
    onError('')
    onPending(true)
    const result = await authClient.signIn.social({
      provider: 'github',
      callbackURL: authReturnPath(search),
      errorCallbackURL: authPath(page, search),
      requestSignUp: intent === 'sign-up',
    })
    if (result.error) {
      onPending(false)
      onError(result.error.message || 'GitHub sign-in failed')
      return
    }
    if (!result.data?.url) {
      onPending(false)
      finishAuth(search)
    }
  }

  return (
    <Button type="button" variant="secondary" disabled={pending} onClick={() => void start()}>
      Continue with GitHub
    </Button>
  )
}
