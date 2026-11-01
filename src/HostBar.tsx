import { ArrowLeft } from 'lucide-react'
import { useLayoutEffect } from 'react'
import './hostToolbar.css'

type HostWindow = Window & { __LIVE_PLAN_THEME_URL__?: string }

type HostBarProps = {
  title: string
  label: string
  logoHref?: string
  themeUrl?: string
  /** Settings uses this to return to the previous history entry. */
  historyBack?: boolean
}

/** Title bar for account pages. The profile control is the account menu. */
export function HostBar({
  title,
  label,
  logoHref = '/dashboard',
  themeUrl,
  historyBack = false,
}: HostBarProps) {
  useLayoutEffect(() => {
    if (themeUrl) (window as HostWindow).__LIVE_PLAN_THEME_URL__ = themeUrl
    void import('../client/chrome/mountChrome.tsx')
  }, [themeUrl])

  return (
    <header className="titlebar">
      {historyBack ? (
        <button type="button" className="titlebar-action titlebar-back" data-history-back="" onClick={() => history.back()}>
          <ArrowLeft size={16} aria-hidden="true" />
          Back
        </button>
      ) : null}
      <a className="logo-btn" href={logoHref} aria-label="Living Plan">
        <img className="titlebar-logo" src="/favicon.png" alt="" width={29} height={29} />
      </a>
      <h1 className="brand">{title}</h1>
      <div className="chrome-tools">
        <div className="account-menu" data-account-menu="" data-label={label}>
          <button type="button" className="titlebar-user" aria-haspopup="menu" aria-expanded="false">
            {label}
          </button>
        </div>
      </div>
    </header>
  )
}
