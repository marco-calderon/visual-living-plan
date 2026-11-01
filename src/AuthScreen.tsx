import type { ReactNode } from 'react'
import './hostToolbar.css'

type AuthScreenProps = {
  title: string
  children: ReactNode
}

/** Title bar and column shared by the hosted sign-in and sign-up pages. */
export function AuthScreen({ title, children }: AuthScreenProps) {
  return (
    <>
      <header className="titlebar">
        <a className="logo-btn" href="/dashboard" aria-label="Living Plan">
          <img className="titlebar-logo" src="/favicon.png" alt="" width={29} height={29} />
        </a>
        <h1 className="brand">Living Plan</h1>
      </header>
      <main className="account-card">
        <h1>{title}</h1>
        <p>The cloud host uses this account. A loopback plan does not.</p>
        {children}
      </main>
    </>
  )
}
