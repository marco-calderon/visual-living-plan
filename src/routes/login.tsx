import { createFileRoute } from '@tanstack/react-router'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../client/ui/button.tsx'
import { AuthScreen } from '../AuthScreen.tsx'
import { authClient } from '../authClient.ts'
import { authPath, authSearch, finishAuth, type AuthSearch } from '../authSearch.ts'
import { SocialAuthButton } from '../SocialAuthButton.tsx'

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): AuthSearch => authSearch(search),
  component: LoginPage,
})

function LoginPage() {
  const search = Route.useSearch()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(search.error ? 'Sign-in did not finish. Try again.' : '')
  const [pending, setPending] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const describedBy = error ? 'auth-error' : undefined

  async function submit() {
    setError('')
    setInvalid(false)
    setPending(true)
    const result = await authClient.signIn.email({ email, password })
    setPending(false)
    if (result.error) {
      setInvalid(true)
      setError(result.error.message || 'Sign-in failed')
      return
    }
    finishAuth(search)
  }

  return (
    <AuthScreen title="Sign in">
      <form
        aria-busy={pending}
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <label>
          <span className="account-label">
            Email <span className="account-note">Required</span>
          </span>
          <input
            type="email"
            name="email"
            required
            aria-required="true"
            autoComplete="username"
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
          <span className="account-password">
            <input
              type={showPassword ? 'text' : 'password'}
              name="password"
              required
              aria-required="true"
              minLength={8}
              autoComplete="current-password"
              value={password}
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              type="button"
              className="account-reveal"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword((current) => !current)}
            >
              {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
            </button>
          </span>
        </label>
        {error ? (
          <p id="auth-error" className="account-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="account-actions">
          <Button type="submit" variant="primary" disabled={pending}>
            <LogIn size={16} aria-hidden="true" />
            Sign in
          </Button>
          <p className="account-divider">or</p>
          <SocialAuthButton
            provider="github"
            search={search}
            intent="sign-in"
            pending={pending}
            onPending={setPending}
            onError={setError}
          />
          <SocialAuthButton
            provider="google"
            search={search}
            intent="sign-in"
            pending={pending}
            onPending={setPending}
            onError={setError}
          />
        </div>
      </form>
      <p>
        <a href={authPath('/signup', search)}>Create an account</a>
      </p>
    </AuthScreen>
  )
}
