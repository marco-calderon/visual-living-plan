import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '../../client/ui/button.tsx'
import { AuthScreen } from '../AuthScreen.tsx'
import { authClient } from '../authClient.ts'
import { authPath, authSearch, finishAuth, type AuthSearch } from '../authSearch.ts'
import { SocialAuthButton } from '../SocialAuthButton.tsx'

export const Route = createFileRoute('/signup')({
  validateSearch: (search: Record<string, unknown>): AuthSearch => authSearch(search),
  component: SignupPage,
})

function SignupPage() {
  const search = Route.useSearch()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(search.error ? 'Sign-in did not finish. Try again.' : '')
  const [pending, setPending] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const describedBy = error ? 'auth-error' : undefined

  async function submit() {
    setError('')
    setInvalid(false)
    setPending(true)
    const result = await authClient.signUp.email({ email, password, name: name.trim() || email })
    setPending(false)
    if (result.error) {
      setInvalid(true)
      setError(result.error.message || 'Could not create the account')
      return
    }
    finishAuth(search)
  }

  return (
    <AuthScreen title="Create an account">
      <form
        aria-busy={pending}
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <label>
          <span className="account-label">
            Name <span className="account-note">Optional</span>
          </span>
          <input
            name="name"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          <span className="account-label">
            Email <span className="account-note">Required</span>
          </span>
          <input
            type="email"
            name="email"
            required
            aria-required="true"
            autoComplete="email"
            value={email}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          <span className="account-label">
            Password <span className="account-note">Required</span>
          </span>
          <input
            type="password"
            name="password"
            required
            aria-required="true"
            minLength={8}
            autoComplete="new-password"
            value={password}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error ? (
          <p id="auth-error" className="account-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="account-actions">
          <Button type="submit" variant="primary" disabled={pending}>
            Create account
          </Button>
          <p className="account-divider">or</p>
          <SocialAuthButton
            provider="github"
            search={search}
            intent="sign-up"
            pending={pending}
            onPending={setPending}
            onError={setError}
          />
          <SocialAuthButton
            provider="google"
            search={search}
            intent="sign-up"
            pending={pending}
            onPending={setPending}
            onError={setError}
          />
        </div>
      </form>
      <p>
        <a href={authPath('/login', search)}>Sign in</a>
      </p>
    </AuthScreen>
  )
}
