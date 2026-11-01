import { createFileRoute, redirect } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useLayoutEffect, useState, type CSSProperties } from 'react'
import { ACCENT_CHOICES } from '../host/accountSettings.ts'
import { CodeWrapSwitch } from '../../client/chrome/CodeWrapSwitch.tsx'
import { Button } from '../../client/ui/button.tsx'
import { DIFFS_THEME_PRESETS, diffsThemePreset, type DiffsThemeSample } from '../diffsTheme.ts'
import { HostBar } from '../HostBar.tsx'
import { loadAccount } from '../planFns.ts'
import './settings.css'

const WIDTHS = [
  { id: 'default', label: 'Default' },
  { id: 'wide', label: 'Wide' },
  { id: 'full', label: 'Full' },
] as const

const SAVED = 'Saved on this host for your account.'
const THEME_URL = '/api/account/settings'

type AppearancePartial = {
  accent?: string
  pageWidth?: string
  diffsTheme?: string
}

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

async function saveHostedAppearance(partial: AppearancePartial): Promise<boolean> {
  const response = await fetch(THEME_URL, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(partial),
  })
  return response.ok
}

function sampleStyle(sample: DiffsThemeSample): CSSProperties {
  return {
    '--sample-bg': sample.bg,
    '--sample-fg': sample.fg,
    '--sample-comment': sample.comment,
    '--sample-string': sample.string,
    '--sample-keyword': sample.keyword,
    '--sample-function': sample.function,
    '--sample-added': sample.added,
    '--sample-deleted': sample.deleted,
  } as CSSProperties
}

function DiffSample({ sample, mode }: { sample: DiffsThemeSample; mode: 'Light' | 'Dark' }) {
  return (
    <div className="diffs-theme-sample" style={sampleStyle(sample)} aria-hidden="true" title={mode}>
      <span className="tok-comment">{`// ${mode}`}</span>
      <span>
        <span className="tok-keyword">const</span> <span className="tok-fn">n</span> = <span className="tok-string">'ok'</span>
      </span>
      <span>
        <span className="tok-added">+ keep</span> <span className="tok-deleted">- drop</span>
      </span>
    </div>
  )
}

function SettingsBackButton() {
  return (
    <button type="button" className="settings-back" data-history-back="" onClick={() => history.back()}>
      <ArrowLeft size={16} aria-hidden="true" />
      Back
    </button>
  )
}

function SettingsPage() {
  const account = Route.useLoaderData()
  const settings = account.settings
  const label = account.user.name || account.user.email
  const currentDiffs = diffsThemePreset(settings.diffsTheme)
  const [error, setError] = useState('')
  const [picker, setPicker] = useState(settings.accent)
  const [diffsOpen, setDiffsOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.planHost = 'cloud'
    root.dataset.accent = settings.accent
    root.dataset.layout = settings.pageWidth
    root.dataset.diffsTheme = settings.diffsTheme
    root.dataset.wrapCode = settings.wrapCode ? 'true' : 'false'
    document.body.classList.remove('layout-default', 'layout-wide', 'layout-full')
    document.body.classList.add(`layout-${settings.pageWidth}`)
    ;(window as Window & { __LIVE_PLAN_THEME_URL__?: string }).__LIVE_PLAN_THEME_URL__ = THEME_URL
  }, [settings.accent, settings.diffsTheme, settings.pageWidth, settings.wrapCode])

  async function save(partial: AppearancePartial) {
    if (saving) return
    setSaving(true)
    setError('')
    const ok = await saveHostedAppearance(partial)
    if (!ok) {
      setSaving(false)
      setError('Could not save those settings.')
      return
    }
    window.location.reload()
  }

  return (
    <>
      <HostBar title="Settings" label={label} themeUrl={THEME_URL} />
      <main className="settings-page">
        <SettingsBackButton />
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
            <p className="settings-meta settings-error" role="alert">
              {error}
            </p>
          </section>

          <section className="block settings-section">
            <div className="settings-kicker">Appearance</div>
            <h3>Accent color</h3>
            <p className="settings-copy">
              Pick one of eight presets tuned for light and dark mode, or set a custom hex. Changes save on this host
              for your account.
            </p>
            <div className="settings-preview">
              <span className="chip">
                <span className="live-dot" /> Preview
              </span>
              <span className="chip">
                Accent <strong>{settings.accent}</strong>
              </span>
            </div>
            <div className="theme-swatches" role="radiogroup" aria-label="Accent presets">
              {ACCENT_CHOICES.map((choice) => (
                <button
                  key={choice.accent}
                  type="button"
                  className="theme-swatch"
                  style={{ '--swatch': choice.accent } as CSSProperties}
                  aria-label={`${choice.label} accent`}
                  aria-checked={choice.accent === settings.accent}
                  title={choice.label}
                  onClick={() => {
                    if (choice.accent === settings.accent) return
                    void save({ accent: choice.accent })
                  }}
                >
                  {choice.label}
                </button>
              ))}
            </div>
            <label className="theme-custom">
              <span>Custom</span>
              <input
                type="color"
                value={picker}
                aria-label="Custom accent color"
                onInput={(event) => setPicker(event.currentTarget.value)}
                onChange={(event) => {
                  const accent = event.currentTarget.value
                  setPicker(accent)
                  if (accent === settings.accent) return
                  void save({ accent })
                }}
              />
              <code>{picker}</code>
            </label>
            <p className="settings-meta">{SAVED}</p>
          </section>

          <section className="block settings-section">
            <div className="settings-kicker">Layout</div>
            <h3>Page width</h3>
            <p className="settings-copy">
              Choose the document column. Default, wide, and full apply to Plan, Workflow, and Settings. Full uses the
              available width.
            </p>
            <div className="width-choices" role="radiogroup" aria-label="Page width">
              {WIDTHS.map((option) => (
                <Button
                  key={option.id}
                  type="button"
                  className="width-choice"
                  role="radio"
                  aria-checked={option.id === settings.pageWidth}
                  onClick={() => {
                    if (option.id === settings.pageWidth) return
                    void save({ pageWidth: option.id })
                  }}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <p className="settings-meta">{SAVED}</p>
          </section>

          <section className="block settings-section">
            <div className="settings-kicker">Code & diffs</div>
            <div className="code-wrap-setting">
              <div className="code-wrap-copy">
                <h3 id="code-wrap-label">Wrap text in code</h3>
                <p className="settings-copy">
                  Long lines wrap inside code blocks, in light and dark. Turn this off to scroll sideways.
                </p>
              </div>
              <div className="code-wrap-control">
                <CodeWrapSwitch initialChecked={settings.wrapCode} />
              </div>
            </div>
            <p className="settings-meta">{SAVED}</p>
            <h3>Pierre theme</h3>
            <p className="settings-copy">
              Choose the Pierre syntax theme used for code blocks and diffs. Light and dark samples follow the page
              color mode.
            </p>
            <div className="settings-accordion" data-open={diffsOpen ? 'true' : 'false'}>
              <button
                type="button"
                className="settings-accordion-trigger"
                id="diffs-theme-toggle"
                aria-expanded={diffsOpen}
                aria-controls="diffs-theme-panel"
                onClick={() => setDiffsOpen((open) => !open)}
              >
                <span className="settings-accordion-trigger-copy">
                  <strong>Diff theme</strong>
                  <span>
                    Current: <strong>{currentDiffs.label}</strong>
                  </span>
                </span>
                <svg className="settings-accordion-chevron" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                  <path
                    fill="currentColor"
                    d="M5.2 7.5a.9.9 0 0 1 1.27-.05L10 10.74l3.53-3.29a.9.9 0 0 1 1.22 1.32l-4.14 3.86a.9.9 0 0 1-1.22 0L5.25 8.77a.9.9 0 0 1-.05-1.27z"
                  />
                </svg>
              </button>
              <div className="settings-accordion-panel" id="diffs-theme-panel" inert={!diffsOpen}>
                <div className="settings-accordion-panel-inner">
                  <div className="settings-accordion-body">
                    <div className="diffs-theme-grid" role="radiogroup" aria-label="Pierre diff themes">
                      {DIFFS_THEME_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          className="diffs-theme-option"
                          aria-label={`${preset.label} theme`}
                          aria-checked={preset.id === currentDiffs.id}
                          title={preset.description}
                          onClick={() => {
                            if (preset.id === currentDiffs.id) return
                            void save({ diffsTheme: preset.id })
                          }}
                        >
                          <div className="diffs-theme-samples">
                            <DiffSample sample={preset.lightSample} mode="Light" />
                            <DiffSample sample={preset.darkSample} mode="Dark" />
                          </div>
                          <span className="diffs-theme-option-meta">
                            <strong>{preset.label}</strong>
                            <span>{preset.description}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                    <p className="settings-meta diffs-note">{SAVED}</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </>
  )
}
