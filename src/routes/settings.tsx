import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useLayoutEffect } from 'react'
import { ACCENT_CHOICES } from '../../cloud/src/accountSettings.ts'
import {
  appearanceSettingsCss,
  appearanceSettingsHtml,
  appearanceSettingsScript,
  settingsDocumentCss,
} from '../appearanceSettings.ts'
import { DIFFS_THEME_PRESETS } from '../diffsTheme.ts'
import { HostBar } from '../HostBar.tsx'
import { loadAccount } from '../planFns.ts'

const WIDTHS = [
  { id: 'default', label: 'Default' },
  { id: 'wide', label: 'Wide' },
  { id: 'full', label: 'Full' },
]

export const Route = createFileRoute('/settings')({
  loader: async () => {
    const result = await loadAccount()
    if (!result.ok) {
      throw redirect({ to: '/login', search: { next: '/settings' } })
    }
    return result.account
  },
  component: SettingsPage,
})

function SettingsPage() {
  const account = Route.useLoaderData()
  const settings = account.settings
  const label = account.user.name || account.user.email
  const saved = 'Saved on this host for your account.'
  const appearance = appearanceSettingsHtml({
    accent: settings.accent,
    pageWidth: settings.pageWidth,
    diffsTheme: settings.diffsTheme,
    wrapCode: settings.wrapCode,
    presets: ACCENT_CHOICES.map((choice) => ({ label: choice.label, accent: choice.accent })),
    widths: WIDTHS,
    diffsThemes: DIFFS_THEME_PRESETS,
    accentCopy:
      'Pick one of eight presets tuned for light and dark mode, or set a custom hex. Changes save on this host for your account.',
    accentNote: saved,
    widthNote: saved,
    wrapNote: saved,
    diffsNote: saved,
  })

  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.planHost = 'cloud'
    root.dataset.accent = settings.accent
    root.dataset.layout = settings.pageWidth
    root.dataset.diffsTheme = settings.diffsTheme
    root.dataset.wrapCode = settings.wrapCode ? 'true' : 'false'
    document.body.classList.remove('layout-default', 'layout-wide', 'layout-full')
    document.body.classList.add(`layout-${settings.pageWidth}`)
  }, [settings.accent, settings.diffsTheme, settings.pageWidth, settings.wrapCode])

  useEffect(() => {
    const source = appearanceSettingsScript('/api/account/settings')
    const script = document.createElement('script')
    script.id = 'appearance-runtime'
    script.text = source.replace(/^<script>/, '').replace(/<\/script>$/, '')
    document.body.appendChild(script)
    return () => {
      script.remove()
    }
  }, [])

  return (
    <>
      <style>{`${settingsDocumentCss}\n${appearanceSettingsCss}`}</style>
      <HostBar title="Settings" label={label} themeUrl="/api/account/settings" />
      <main className="settings-page">
        <div className="settings-stack">
          <section className="block settings-section" data-account-section="" data-host-panel="cloud">
            <div className="settings-kicker">Account</div>
            <h3>Signed in as {account.user.email}</h3>
            <p className="settings-copy">
              Name <strong>{label}</strong>
            </p>
            <p className="settings-copy">
              Tier <strong>{account.user.tier}</strong>
            </p>
            <p className="settings-copy">
              If a terminal is waiting on account login, close this window and return to it. Host a plan from that
              machine with <code>live-plan serve path/to/work.plan.md --cloud</code>. Each publish stores the plan
              here. Loopback plans stay separate and do not require this account.
            </p>
            <p className="settings-meta" data-settings-error="" role="alert" />
          </section>
          <div dangerouslySetInnerHTML={{ __html: appearance }} />
        </div>
      </main>
    </>
  )
}
