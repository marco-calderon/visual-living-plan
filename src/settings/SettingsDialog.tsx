import { Dialog } from '@base-ui/react/dialog'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Gauge, Info, Search, SlidersHorizontal, UserRound, X } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { applyAppearance } from '../appearanceDom.ts'
import { versionSectionHtml } from '../changelogParse.ts'
import { DIFFS_THEME_PRESETS, diffsThemePreset, type DiffsThemeSample } from '../diffsTheme.ts'
import { ACCENT_CHOICES } from '../host/accountSettings.ts'
import type { AccountUsage } from '../host/accountUsage.ts'
import { loadHostedRelease } from '../hostedRelease.ts'
import { LinkSocialAccounts } from '../LinkSocialAccounts.tsx'
import { accountWithSettings, isAccountNetworkFailure } from '../offlineSync.ts'
import type { AccountPayload } from '../planFns.ts'
import { Button } from '../../client/ui/button.tsx'
import { Switch } from '../../client/ui/Switch.tsx'
import { currentOfflineHandle, startOfflineEngine } from '../../client/offline/engine.ts'
import {
  filterSections,
  formatBytes,
  groupSections,
  SETTINGS_SECTIONS,
  type SettingsSectionId,
} from './settingsSections.ts'
import './settingsDialog.css'

const THEME_URL = '/api/account/settings'
const SAVED = 'Saved on this host for your account.'

const WIDTHS = [
  { id: 'default', label: 'Default' },
  { id: 'wide', label: 'Wide' },
  { id: 'full', label: 'Full' },
] as const

const ICONS: Record<SettingsSectionId, ReactNode> = {
  general: <SlidersHorizontal size={16} aria-hidden="true" />,
  account: <UserRound size={16} aria-hidden="true" />,
  usage: <Gauge size={16} aria-hidden="true" />,
  about: <Info size={16} aria-hidden="true" />,
}

type Settings = AccountPayload['settings']
type AppearancePartial = Partial<Pick<Settings, 'accent' | 'pageWidth' | 'diffsTheme' | 'wrapCode'>>

class SignedOut extends Error {}

function isAccountPayload(value: unknown): value is AccountPayload {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<AccountPayload>
  return Boolean(record.user && typeof record.user.email === 'string' && record.settings)
}

function pendingSettings<T extends { pending?: boolean }>(row: T | undefined): T | undefined {
  return row?.pending ? row : undefined
}

/** Network first. Offline, the account kept on this device. */
async function readSettingsAccount(): Promise<AccountPayload> {
  const engine = await startOfflineEngine()
  try {
    const response = await fetch('/api/account', { cache: 'no-store', credentials: 'include' })
    if (response.status === 401) throw new SignedOut('Sign in to change settings.')
    if (!response.ok) throw new Error('Could not read your account.')
    const account = accountWithSettings((await response.json()) as AccountPayload, pendingSettings(engine?.settings('account')))
    engine?.rememberAccount(account)
    return account
  } catch (error) {
    if (error instanceof SignedOut || !isAccountNetworkFailure(error, navigator.onLine)) throw error
    const stored = engine?.account()?.payload
    if (!isAccountPayload(stored)) throw error
    return accountWithSettings(stored, engine?.settings('account'))
  }
}

async function readUsage(): Promise<AccountUsage> {
  const response = await fetch('/api/account/usage', { cache: 'no-store', credentials: 'include' })
  if (!response.ok) throw new Error(response.status === 401 ? 'Sign in to see usage.' : 'Could not read storage usage.')
  return (await response.json()) as AccountUsage
}

async function saveHostedAppearance(partial: AppearancePartial): Promise<boolean> {
  const engine = await startOfflineEngine()
  if (engine?.available) {
    await engine.saveSettings('account', { ...partial, url: THEME_URL })
    return true
  }
  const response = await fetch(THEME_URL, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...partial, updatedAt: Date.now() }),
  })
  return response.ok
}

/** The dashboard and the owner's plans follow the account look. Someone else's plan keeps its own. */
function pageFollowsAccount(): boolean {
  const onPlan = Boolean(document.getElementById('plan-mdx-root'))
  return !onPlan || document.body.dataset.planOwner === 'true'
}

type SettingsDialogProps = {
  section: SettingsSectionId | undefined
  errorCode?: string
  onSelect: (section: SettingsSectionId) => void
  onClose: () => void
}

/** Account settings as a layer over the open page. The section is in the URL, so Back closes it. */
export function SettingsDialog({ section, errorCode, onSelect, onClose }: SettingsDialogProps) {
  // The server renders no dialog. A modal marks the rest of the page inert, so wait until the
  // code-split page under it has hydrated too, or React reports the added attributes as a mismatch.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    let frame = 0
    const ready = () => {
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => setMounted(true))
      })
    }
    if (document.readyState === 'complete') ready()
    else window.addEventListener('load', ready, { once: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('load', ready)
    }
  }, [])
  const open = mounted && Boolean(section)
  // Focus the panel, not the close button, so the first keypress does not dismiss it.
  const popup = useRef<HTMLDivElement>(null)
  // Keep the last section on screen while the dialog animates out.
  const [shown, setShown] = useState<SettingsSectionId>(section ?? 'general')
  useEffect(() => {
    if (section) setShown(section)
  }, [section])

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="settings-backdrop" data-plan-grab-ignore="" />
        <Dialog.Popup
          ref={popup}
          initialFocus={popup}
          className="settings-dialog"
          data-plan-grab-ignore=""
          data-settings-dialog=""
        >
          <header className="settings-dialog-head">
            <Dialog.Title className="settings-dialog-title">Settings</Dialog.Title>
            <Dialog.Close
              render={<Button variant="ghost" className="settings-dialog-close" aria-label="Close settings" />}
            >
              <X size={16} aria-hidden="true" />
            </Dialog.Close>
          </header>
          {open ? <SettingsBody section={shown} errorCode={errorCode} onSelect={onSelect} /> : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function SettingsBody({
  section,
  errorCode,
  onSelect,
}: {
  section: SettingsSectionId
  errorCode?: string
  onSelect: (section: SettingsSectionId) => void
}) {
  const [query, setQuery] = useState('')
  const matches = filterSections(query)
  const pane = useRef<HTMLDivElement>(null)
  const account = useQuery({ queryKey: ['settings-account'], queryFn: readSettingsAccount, retry: false })
  const label = SETTINGS_SECTIONS.find((item) => item.id === section)?.label ?? 'General'

  useEffect(() => {
    pane.current?.scrollTo({ top: 0 })
  }, [section])

  return (
    <div className="settings-dialog-body">
      <nav className="settings-nav" aria-label="Settings sections">
        <label className="settings-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            placeholder="Search"
            aria-label="Search settings"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              const first = matches[0]
              if (event.key === 'Enter' && first) onSelect(first.id)
            }}
          />
        </label>
        {groupSections(matches).map((group) => (
          <div className="settings-nav-group" key={group.group}>
            <p className="settings-nav-label">{group.group}</p>
            <ul>
              {group.sections.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="settings-nav-item"
                    aria-current={item.id === section ? 'page' : undefined}
                    data-settings-section={item.id}
                    onClick={() => onSelect(item.id)}
                  >
                    {ICONS[item.id]}
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {matches.length === 0 ? <p className="settings-nav-empty">No settings match “{query}”.</p> : null}
      </nav>
      <div className="settings-pane" ref={pane} data-section={section}>
        <h2 className="settings-pane-title">{label}</h2>
        {account.isPending ? (
          <p className="settings-copy">Loading your account…</p>
        ) : account.isError ? (
          <AccountError error={account.error} />
        ) : section === 'general' ? (
          <GeneralSection account={account.data} />
        ) : section === 'account' ? (
          <AccountSection account={account.data} errorCode={errorCode} />
        ) : section === 'usage' ? (
          <UsageSection />
        ) : (
          <AboutSection />
        )}
      </div>
    </div>
  )
}

function AccountError({ error }: { error: Error }) {
  if (error instanceof SignedOut) {
    const next = `${location.pathname}${location.search}`
    return (
      <div className="settings-group">
        <p className="settings-copy">{error.message}</p>
        <Button variant="primary" nativeButton={false} render={<a href={`/login?next=${encodeURIComponent(next)}`} />}>
          Sign in
        </Button>
      </div>
    )
  }
  return (
    <p className="settings-copy settings-error" role="alert">
      {error.message}
    </p>
  )
}

function SettingsRow({
  title,
  id,
  description,
  children,
  stacked = false,
}: {
  title: string
  id?: string
  description?: ReactNode
  children?: ReactNode
  stacked?: boolean
}) {
  return (
    <div className="settings-row" data-stacked={stacked ? 'true' : undefined}>
      <div className="settings-row-copy">
        <p className="settings-row-title" id={id}>
          {title}
        </p>
        {description ? <p className="settings-row-description">{description}</p> : null}
      </div>
      {children ? <div className="settings-row-control">{children}</div> : null}
    </div>
  )
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
        <span className="tok-keyword">const</span> <span className="tok-fn">n</span> ={' '}
        <span className="tok-string">'ok'</span>
      </span>
      <span>
        <span className="tok-added">+ keep</span> <span className="tok-deleted">- drop</span>
      </span>
    </div>
  )
}

function GeneralSection({ account }: { account: AccountPayload }) {
  const queryClient = useQueryClient()
  const [settings, setSettings] = useState<Settings>(account.settings)
  const [picker, setPicker] = useState(account.settings.accent)
  const [error, setError] = useState('')
  const [diffsOpen, setDiffsOpen] = useState(false)
  const appearance = useMutation({ mutationFn: saveHostedAppearance })
  const currentDiffs = diffsThemePreset(settings.diffsTheme)
  const follows = typeof document === 'undefined' ? true : pageFollowsAccount()

  useEffect(() => {
    // A change saved on this device while offline is newer than the cached account.
    let stop = () => {}
    let cancelled = false
    void startOfflineEngine().then((engine) => {
      if (cancelled || !engine?.available) return
      const paint = () =>
        setSettings((current) => {
          const row = currentOfflineHandle()?.settings('account')
          return accountWithSettings({ settings: current }, row).settings
        })
      paint()
      stop = engine.subscribe(paint)
    })
    return () => {
      cancelled = true
      stop()
    }
  }, [])

  useEffect(() => {
    if (pageFollowsAccount()) applyAppearance(settings, { notify: true })
  }, [settings.accent, settings.diffsTheme, settings.pageWidth, settings.wrapCode])

  async function save(partial: AppearancePartial) {
    if (appearance.isPending) return
    setError('')
    const ok = await appearance.mutateAsync(partial).catch(() => false)
    if (!ok) {
      setError('Could not save those settings.')
      return
    }
    const next = { ...settings, ...partial, updatedAt: Date.now() }
    setSettings(next)
    queryClient.setQueryData<AccountPayload>(['settings-account'], (current) => (current ? { ...current, settings: next } : current))
    if (partial.accent) setPicker(partial.accent)
  }

  return (
    <>
      <p className="settings-error" role="alert">
        {error}
      </p>
      {follows ? null : (
        <p className="settings-note">This plan belongs to another account and keeps its owner's look. Your changes apply to your own pages.</p>
      )}
      <section className="settings-group" aria-labelledby="settings-appearance">
        <h3 id="settings-appearance">Appearance</h3>
        <SettingsRow
          title="Accent color"
          description="Eight presets tuned for light and dark, or a custom hex."
          stacked
        >
          <div className="theme-swatches" role="radiogroup" aria-label="Accent presets">
            {ACCENT_CHOICES.map((choice) => (
              <button
                key={choice.accent}
                type="button"
                className="theme-swatch"
                role="radio"
                style={{ '--swatch': choice.accent } as CSSProperties}
                aria-label={`${choice.label} accent`}
                aria-checked={choice.accent === settings.accent}
                title={choice.label}
                onClick={() => {
                  if (choice.accent !== settings.accent) void save({ accent: choice.accent })
                }}
              >
                {choice.label}
              </button>
            ))}
            <label className="theme-custom">
              <input
                type="color"
                value={picker}
                aria-label="Custom accent color"
                onInput={(event) => setPicker(event.currentTarget.value)}
                onChange={(event) => {
                  const accent = event.currentTarget.value
                  setPicker(accent)
                  if (accent !== settings.accent) void save({ accent })
                }}
              />
              <code>{picker}</code>
            </label>
          </div>
        </SettingsRow>
        <SettingsRow title="Page width" description="The document column on Plan, Workflow, and the dashboard.">
          <div className="width-choices" role="radiogroup" aria-label="Page width">
            {WIDTHS.map((option) => (
              <Button
                key={option.id}
                type="button"
                className="width-choice"
                role="radio"
                aria-checked={option.id === settings.pageWidth}
                onClick={() => {
                  if (option.id !== settings.pageWidth) void save({ pageWidth: option.id })
                }}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </SettingsRow>
      </section>

      <section className="settings-group" aria-labelledby="settings-code">
        <h3 id="settings-code">Code</h3>
        <SettingsRow
          title="Wrap text in code"
          id="settings-wrap-label"
          description="Long lines wrap inside code blocks. Turn this off to scroll sideways."
        >
          <Switch
            checked={settings.wrapCode}
            aria-labelledby="settings-wrap-label"
            onCheckedChange={(next) => void save({ wrapCode: next })}
          />
        </SettingsRow>
        <SettingsRow title="Pierre theme" description="Syntax colors for code blocks and diffs." stacked>
          <div className="settings-accordion" data-open={diffsOpen ? 'true' : 'false'}>
            <button
              type="button"
              className="settings-accordion-trigger"
              aria-expanded={diffsOpen}
              aria-controls="settings-diffs-panel"
              onClick={() => setDiffsOpen((value) => !value)}
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
            <div className="settings-accordion-panel" id="settings-diffs-panel" inert={!diffsOpen}>
              <div className="settings-accordion-panel-inner">
                <div className="settings-accordion-body">
                  <div className="diffs-theme-grid" role="radiogroup" aria-label="Pierre diff themes">
                    {DIFFS_THEME_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className="diffs-theme-option"
                        role="radio"
                        aria-label={`${preset.label} theme`}
                        aria-checked={preset.id === currentDiffs.id}
                        title={preset.description}
                        onClick={() => {
                          if (preset.id !== currentDiffs.id) void save({ diffsTheme: preset.id })
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
                </div>
              </div>
            </div>
          </div>
        </SettingsRow>
      </section>
      <p className="settings-meta">{SAVED}</p>
    </>
  )
}

function AccountSection({ account, errorCode }: { account: AccountPayload; errorCode?: string }) {
  const label = account.user.name || account.user.email
  return (
    <>
      <section className="settings-group" aria-labelledby="settings-profile" data-account-section="" data-host-panel="cloud">
        <h3 id="settings-profile">Profile</h3>
        <SettingsRow title="Email">
          <span className="settings-value">{account.user.email}</span>
        </SettingsRow>
        <SettingsRow title="Name">
          <span className="settings-value">{label}</span>
        </SettingsRow>
        <SettingsRow title="Tier">
          <span className="settings-badge">{account.user.tier}</span>
        </SettingsRow>
        <SettingsRow
          title="Publish from a terminal"
          description={
            <>
              Host a plan from that machine with <code>live-plan serve path/to/work.plan.md --cloud</code>. Each publish
              stores the plan here. Loopback plans stay separate and do not require this account.
            </>
          }
        />
      </section>
      <LinkSocialAccounts email={account.user.email} accounts={account.accounts ?? []} errorCode={errorCode} />
    </>
  )
}

function UsageSection() {
  const usage = useQuery({ queryKey: ['settings-usage'], queryFn: readUsage, retry: false })
  if (usage.isPending) return <p className="settings-copy">Reading storage…</p>
  if (usage.isError) {
    return (
      <p className="settings-copy settings-error" role="alert">
        {typeof navigator !== 'undefined' && !navigator.onLine ? 'Usage needs a connection.' : usage.error.message}
      </p>
    )
  }
  const data = usage.data
  const largest = Math.max(1, ...data.byPlan.map((plan) => plan.bytes))
  const activeShare = Math.min(1, data.activePlans / Math.max(1, data.activeCap))
  return (
    <>
      <div className="usage-stats">
        <div className="usage-stat">
          <p className="usage-stat-label">Stored</p>
          <p className="usage-stat-value" data-usage-bytes={data.bytes}>
            {formatBytes(data.bytes)}
          </p>
        </div>
        <div className="usage-stat">
          <p className="usage-stat-label">Versions</p>
          <p className="usage-stat-value">{data.versions}</p>
        </div>
        <div className="usage-stat">
          <p className="usage-stat-label">Active plans</p>
          <p className="usage-stat-value">
            {data.activePlans}
            <span> of {data.activeCap}</span>
          </p>
          <div
            className="usage-meter"
            role="meter"
            aria-label="Active plans"
            aria-valuemin={0}
            aria-valuemax={data.activeCap}
            aria-valuenow={data.activePlans}
            data-full={activeShare >= 1 ? 'true' : undefined}
          >
            <span style={{ width: `${activeShare * 100}%` }} />
          </div>
        </div>
      </div>
      <section className="settings-group" aria-labelledby="settings-usage-plans">
        <h3 id="settings-usage-plans">By plan</h3>
        {data.byPlan.length === 0 ? (
          <p className="settings-copy">No hosted plans yet.</p>
        ) : (
          <table className="usage-table">
            <thead>
              <tr>
                <th scope="col">Plan</th>
                <th scope="col">Versions</th>
                <th scope="col">Size</th>
              </tr>
            </thead>
            <tbody>
              {data.byPlan.map((plan) => (
                <tr key={plan.id}>
                  <th scope="row">
                    <a href={`/plans/${encodeURIComponent(plan.id)}`}>{plan.title}</a>
                    <span className="usage-bar" aria-hidden="true">
                      <span style={{ width: `${(plan.bytes / largest) * 100}%` }} />
                    </span>
                  </th>
                  <td>{plan.versions}</td>
                  <td>{formatBytes(plan.bytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <p className="settings-meta">
        Counts the published versions of each plan on the {data.tier} tier. The latest {data.versionLimit} per plan are
        kept. Comments and answers live with each plan and are not counted.
      </p>
    </>
  )
}

function AboutSection() {
  const release = useQuery({ queryKey: ['hosted-release'], queryFn: loadHostedRelease, staleTime: Infinity })
  if (release.isPending) return <p className="settings-copy">Reading the release…</p>
  const about = release.data ?? null
  const html = about ? versionSectionHtml(about.version, about.release, 'hosted') : ''
  if (!html) return <p className="settings-copy">No release notes on this host.</p>
  // versionSectionHtml escapes every changelog line.
  return <div className="settings-version" dangerouslySetInnerHTML={{ __html: html }} />
}
