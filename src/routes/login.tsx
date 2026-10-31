import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { authClient } from '../authClient.ts'
import '../hostToolbar.css'

type LoginSearch = { next?: string; cli?: string }

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): LoginSearch => {
    const next = typeof search.next === 'string' && search.next.startsWith('/') && !search.next.startsWith('//') ? search.next : undefined
    const cli = typeof search.cli === 'string' && search.cli ? search.cli : undefined
    return { ...(next ? { next } : {}), ...(cli ? { cli } : {}) }
  },
  component: LoginPage,
})

function LoginPage() {
  const search = Route.useSearch()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function finish() {
    if (search.cli) {
      window.location.assign(`/api/auth/cli-session?redirect=${encodeURIComponent(search.cli)}`)
      return
    }
    window.location.assign(search.next ?? '/dashboard')
  }

  async function submit(kind: 'sign-in' | 'sign-up') {
    setError('')
    setPending(true)
    const result =
      kind === 'sign-up'
        ? await authClient.signUp.email({ email, password, name: name || email })
        : await authClient.signIn.email({ email, password })
    setPending(false)
    if (result.error) {
      setError(result.error.message || 'Sign-in failed')
      return
    }
    await finish()
  }

  return (
    <>
      <header className="titlebar">
        <a className="logo-btn" href="/dashboard" aria-label="Living Plan">
          <img className="titlebar-logo" src="/favicon.png" alt="" width={29} height={29} />
        </a>
        <h1 className="brand">Living Plan</h1>
      </header>
      <main className="account-card">
      <h1>Sign in</h1>
      <p>The cloud host uses this account. A loopback plan does not.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit('sign-in')
        }}
      >
        <label>
          Name
          <input value={name} autoComplete="name" onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Email
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            minLength={8}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error ? (
          <p className="account-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="account-actions">
          <button type="submit" disabled={pending}>
            Sign in
          </button>
          <button type="button" className="secondary" disabled={pending} onClick={() => void submit('sign-up')}>
            Create account
          </button>
        </div>
      </form>
      <p>
        <a href="/local">Open the same page without an account</a>
      </p>
    </main>
    </>
  )
}
