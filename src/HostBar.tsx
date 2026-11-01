import { useLayoutEffect } from 'react'
import { Button } from '../client/ui/button.tsx'
import './hostToolbar.css'

type HostWindow = Window & { __LIVE_PLAN_THEME_URL__?: string }

type HostBarProps = {
  title: string
  label: string
  logoHref?: string
  themeUrl?: string
}

/** Title bar for account pages. The profile control is the account menu. */
export function HostBar({ title, label, logoHref = '/dashboard', themeUrl }: HostBarProps) {
  useLayoutEffect(() => {
    if (themeUrl) (window as HostWindow).__LIVE_PLAN_THEME_URL__ = themeUrl
    void import('../client/chrome/mountChrome.tsx')
  }, [themeUrl])

  return (
    <header className="titlebar">
      <a className="logo-btn" href={logoHref} aria-label="Living Plan">
        <img className="titlebar-logo" src="/favicon.png" alt="" width={29} height={29} />
      </a>
      <h1 className="brand">{title}</h1>
      <div className="chrome-tools">
        <div className="account-menu" data-account-menu="" data-label={label}>
          <Button type="button" variant="secondary" className="titlebar-user" aria-haspopup="menu" aria-expanded="false">
            {label}
          </Button>
        </div>
      </div>
    </header>
  )
}
