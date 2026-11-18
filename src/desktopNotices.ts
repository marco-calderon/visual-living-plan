/**
 * The desktop app's own notices, drawn inside whatever page its window shows ([ADR 0042]).
 *
 * `scripts/build-desktop.ts` bundles this file into `src-tauri/web/notices.js`, and the app adds it
 * to every window as an initialization script beside `desktop/bridge.js`. It shows nothing on its
 * own. The app calls it with `window.eval` when there is something to show:
 *
 *   window.__LIVING_PLAN_NOTICES__.update(notice)   the update notice, or null to take it away
 *   window.__LIVING_PLAN_NOTICES__.whatsNew(notes)  the What's new modal, or null to close it
 *
 * The update notice is a Ding toast that stays until the update is done: it shows the download's
 * progress, then Restart now and Later. What's new is the Settings modal's frame
 * (`src/settings/dialogFrame.css`) with the release cards of its About section.
 *
 * Both live in a shadow root, so the page's styles do not reach them and theirs do not reach the
 * page, and their Ding toaster is this bundle's own: the page's toasts neither replace nor dismiss
 * the update notice. The app owns this script, so the notices work on every page, whichever plan
 * service or hosted build served it.
 *
 * Buttons answer the app by following `living-plan://` links, as the toolbar and Settings do. The
 * app acts on a link only when its own state agrees (a restart needs an update installed), so a
 * page that calls these functions itself can show a notice but cannot make the app do anything.
 *
 * [ADR 0042]: ../docs/architecture/decisions/0042-update-notices-and-whats-new.md
 */
import { buildCss, mountToaster, onToastKey, toast, type ToastType } from '@yusufceng1z/ding'
import type { VersionNotes, WhatsNew } from './releaseNotes'
import { formatBytes } from './formatBytes'

/** The notices' stylesheet, put in by the build: the plan toaster, buttons, the Settings frame, and desktopNotices.css. */
declare const __DESKTOP_NOTICES_CSS__: string

/** What the app's updater is doing, as `src-tauri/src/update.rs` sends it. */
export type UpdateNotice =
  | { stage: 'checking' }
  | { stage: 'downloading'; version: string; received: number; total: number | null }
  | { stage: 'installing'; version: string }
  | { stage: 'ready'; version: string }
  | { stage: 'current'; version: string }
  | { stage: 'failed'; message: string; retry: boolean }

export type NoticesApi = {
  update(notice: UpdateNotice | null): void
  whatsNew(notes: WhatsNew | null): void
}

/** The links the notices follow. `src-tauri/src/app_link.rs` reads them. */
export const NOTICE_LINKS = {
  restart: 'living-plan://update/restart',
  later: 'living-plan://update/later',
  hide: 'living-plan://update/hide',
  check: 'living-plan://update/check',
  notesSeen: 'living-plan://notes/seen',
} as const

export const RELEASES_URL = 'https://github.com/marco-calderon/visual-living-plan/releases'

/** An "up to date" answer closes after this long. Everything else stays until it is done or dismissed. */
export const CURRENT_MS = 4000

type ToastButton = { label: string; href: string; then?: { title: string; type: ToastType; description?: string } }

export type UpdateToast = {
  type: ToastType
  title: string
  description?: string
  /** 0 to 1, or absent for no bar. */
  progress?: number
  /** 0 stays until dismissed. */
  duration: number
  action?: ToastButton
  secondary?: ToastButton
}

/** The toast for a notice. Pure, so the wording is tested without a page. */
export function updateToast(notice: UpdateNotice): UpdateToast {
  switch (notice.stage) {
    case 'checking':
      return { type: 'loading', title: 'Checking for updates…', duration: 0 }
    case 'downloading': {
      const total = notice.total && notice.total > 0 ? notice.total : null
      const progress = total ? Math.min(1, Math.max(0, notice.received / total)) : undefined
      return {
        type: 'loading',
        title: `Downloading Living Plan ${notice.version}`,
        description: total
          ? `${formatBytes(notice.received)} of ${formatBytes(total)} · ${Math.floor((progress ?? 0) * 100)}%`
          : notice.received > 0
            ? `${formatBytes(notice.received)} so far`
            : 'Starting the download…',
        progress,
        duration: 0,
        secondary: { label: 'Hide', href: NOTICE_LINKS.hide },
      }
    }
    case 'installing':
      return {
        type: 'loading',
        title: `Installing Living Plan ${notice.version}`,
        description: 'Checking the signature and replacing the app.',
        progress: 1,
        duration: 0,
      }
    case 'ready':
      return {
        type: 'success',
        title: `Living Plan ${notice.version} is ready`,
        description: 'Restart to use it. The plan service keeps running, so agents are not interrupted.',
        duration: 0,
        action: { label: 'Restart now', href: NOTICE_LINKS.restart, then: { title: 'Restarting…', type: 'loading' } },
        secondary: { label: 'Later', href: NOTICE_LINKS.later },
      }
    case 'current':
      return { type: 'success', title: `Living Plan ${notice.version} is up to date`, duration: CURRENT_MS }
    case 'failed':
      return {
        type: 'error',
        title: 'Could not update Living Plan',
        description: notice.message,
        duration: 0,
        action: notice.retry ? { label: 'Try again', href: NOTICE_LINKS.check, then: { title: 'Checking for updates…', type: 'loading' } } : undefined,
      }
  }
}

/** Notices that are the same step of the same update. A dismissed one stays away until the step changes. */
function step(notice: UpdateNotice): string {
  return 'version' in notice ? `${notice.stage}:${notice.version}` : notice.stage
}

// ---- Inline text --------------------------------------------------------------------------------

/**
 * Changelog bullets are Markdown. Code spans, bold, and emphasis are kept; a link keeps its text.
 * Everything else is text. No HTML is parsed.
 */
export function inlineParts(text: string): Array<{ kind: 'text' | 'code' | 'strong' | 'em'; text: string }> {
  const parts: Array<{ kind: 'text' | 'code' | 'strong' | 'em'; text: string }> = []
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*\s][^*]*?)\*|\[([^\]]+)\]\([^)\s]+\)/g
  let last = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > last) parts.push({ kind: 'text', text: text.slice(last, index) })
    if (match[1] !== undefined) parts.push({ kind: 'code', text: match[1] })
    else if (match[2] !== undefined) parts.push({ kind: 'strong', text: match[2] })
    else if (match[3] !== undefined) parts.push({ kind: 'em', text: match[3] })
    else parts.push({ kind: 'text', text: match[4] ?? '' })
    last = index + match[0].length
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) })
  // Neighbouring text pieces read as one.
  return parts.reduce<typeof parts>((joined, part) => {
    const previous = joined.at(-1)
    if (previous?.kind === 'text' && part.kind === 'text') previous.text += part.text
    else joined.push({ ...part })
    return joined
  }, [])
}

/** `2026-11-18` as a date a person reads, in the page's language. */
export function releaseDate(date: string | null): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '')
  if (!match) return ''
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return day.toLocaleDateString(undefined, { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' })
}

/** The headline of the notes: the minor line the app moved to. */
export function whatsNewTitle(notes: WhatsNew): string {
  const minor = /^(\d+\.\d+)\./.exec(notes.version)?.[1]
  return minor ? `What's new in Living Plan ${minor}` : "What's new in Living Plan"
}

/** The release cards of one version, in the order a person reads them: what is new, what got better, what was fixed. */
export function releaseCards(notes: VersionNotes): Array<{ kind: string; label: string; items: string[] }> {
  return [
    { kind: 'features', label: 'New features', items: notes.features },
    { kind: 'improvements', label: 'Improvements', items: notes.improvements },
    { kind: 'bugs', label: 'Bugs fixed', items: notes.bugs },
    { kind: 'changes', label: 'Changes', items: notes.changes },
  ].filter((card) => card.items.length > 0)
}

// ---- The page side ------------------------------------------------------------------------------

const ICON_X = 'M18 6 6 18M6 6l12 12'

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, parent?: Node): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  parent?.appendChild(node)
  return node
}

function richText(parent: HTMLElement, text: string): void {
  for (const part of inlineParts(text)) {
    if (part.kind === 'text') parent.append(part.text)
    else element(part.kind, undefined, parent).textContent = part.text
  }
}

function icon(path: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '16')
  svg.setAttribute('height', '16')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('aria-hidden', 'true')
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  line.setAttribute('d', path)
  svg.append(line)
  return svg
}

function createNotices(): NoticesApi {
  let shadow: ShadowRoot | null = null
  /** Takes the toaster down. Set while it is mounted in the current shadow root. */
  let unmountToaster: (() => void) | null = null
  /** The toast showing the update, while it is open. */
  let toastId: string | null = null
  let toastCount = 0
  /** The step the person dismissed. Later notices of the same step stay away. */
  let dismissed: string | null = null
  let notesOpen: { version: string; close: (seen: boolean) => void } | null = null

  /**
   * Follow an app link from inside the page, as a click on a link in it would. While the notes are
   * open the rest of the page is inert, so their links are clicked inside them.
   */
  function follow(href: string, inside?: Element): void {
    const link = element('a', undefined, inside ?? host())
    link.href = href
    link.hidden = true
    link.click()
    link.remove()
  }

  function host(): ShadowRoot {
    if (shadow?.host.isConnected) return shadow
    const node = document.createElement('living-plan-notices')
    // Out of the page's layout and stacking. Custom properties such as --titlebar-offset still reach in.
    node.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647'
    shadow = node.attachShadow({ mode: 'open' })
    const css = `${buildCss()}\n${__DESKTOP_NOTICES_CSS__}`
    try {
      const sheet = new CSSStyleSheet()
      sheet.replaceSync(css)
      shadow.adoptedStyleSheets = [sheet]
    } catch {
      element('style', undefined, shadow).textContent = css
    }
    ;(document.body ?? document.documentElement).appendChild(node)
    // A new root needs a new toaster: the old one drew into a node the page took away.
    unmountToaster?.()
    unmountToaster = null
    return shadow
  }

  function toaster(): void {
    const root = host()
    if (unmountToaster) return
    const before = new Set(document.querySelectorAll('body > .tst-viewport'))
    unmountToaster = mountToaster({ position: 'top-right', theme: 'system', labels: { region: 'Living Plan updates', dismiss: 'Dismiss' } })
    // The page's Escape belongs to the page: it must not dismiss a notice the update still needs.
    document.removeEventListener('keydown', onToastKey)
    const viewport = [...document.querySelectorAll('body > .tst-viewport')].find((node) => !before.has(node))
    if (viewport) {
      viewport.setAttribute('data-desktop-notices', '')
      root.appendChild(viewport)
    }
    // Ding also put its stylesheet in the page, where a page's own Ding toaster may use it. The
    // shadow root carries its own copy.
  }

  function open(id: string | null): boolean {
    if (!id) return false
    return toast.getState().toasts.some((item) => item.id === id && (item.phase === 'enter' || item.phase === 'open'))
  }

  function button(view: UpdateToast, which: 'action' | 'secondary', key: string) {
    const spec = view[which]
    if (!spec) return null
    return {
      label: spec.label,
      onClick: () => {
        follow(spec.href)
        if (spec.then) return { ...spec.then, duration: 0, progress: null }
        // Hide and Later: this step stays away in this page until the app moves on.
        dismissed = key
        toastId = null
        return undefined
      },
    }
  }

  function update(notice: UpdateNotice | null): void {
    if (!notice) {
      if (toastId && open(toastId)) toast.dismiss(toastId)
      toastId = null
      dismissed = null
      return
    }
    const key = step(notice)
    if (dismissed === key) return
    dismissed = null
    const view = updateToast(notice)
    const action = button(view, 'action', key)
    const secondary = button(view, 'secondary', key)
    if (toastId && open(toastId)) {
      toast.update(toastId, {
        type: view.type,
        title: view.title,
        description: view.description ?? '',
        progress: view.progress ?? null,
        duration: view.duration,
        action,
        secondary,
      })
      return
    }
    toaster()
    toastCount += 1
    toastId = `living-plan-update-${toastCount}`
    toast.show(view.type, view.title, {
      id: toastId,
      description: view.description,
      progress: view.progress,
      duration: view.duration,
      action: action ?? undefined,
      secondary: secondary ?? undefined,
    })
  }

  function whatsNew(notes: WhatsNew | null): void {
    if (!notes) {
      notesOpen?.close(false)
      return
    }
    if (notesOpen?.version === notes.version) return
    notesOpen?.close(false)
    const version = notes.version
    const root = host()
    const dialog = element('dialog', 'whats-new-layer', root)
    dialog.setAttribute('aria-labelledby', 'whats-new-title')
    const backdrop = element('div', 'settings-backdrop', dialog)
    const panel = element('div', 'settings-dialog whats-new', dialog)
    panel.tabIndex = -1
    panel.dataset.whatsNew = notes.version

    const head = element('header', 'settings-dialog-head', panel)
    const title = element('h2', 'settings-dialog-title', head)
    title.id = 'whats-new-title'
    title.textContent = whatsNewTitle(notes)
    const close = element('button', 'plan-btn plan-btn-ghost settings-dialog-close', head)
    close.type = 'button'
    close.setAttribute('aria-label', "Close What's new")
    close.append(icon(ICON_X))

    const body = element('div', 'whats-new-body', panel)
    const lede = element('p', 'settings-copy whats-new-lede', body)
    lede.append('Living Plan ')
    element('strong', undefined, lede).textContent = notes.version
    lede.append(' is installed. Here is what changed.')
    for (const release of notes.releases) {
      const section = element('section', 'whats-new-release', body)
      section.dataset.version = release.version
      const heading = element('div', 'whats-new-release-head', section)
      element('h3', 'whats-new-version', heading).textContent = release.version
      const date = releaseDate(release.date)
      if (date) element('span', 'settings-meta', heading).textContent = date
      if (release.summary) richText(element('p', 'settings-copy', section), release.summary)
      const cards = releaseCards(release)
      if (!cards.length) continue
      const list = element('div', 'release-cards', section)
      for (const card of cards) {
        const article = element('article', 'release-card', list)
        article.dataset.kind = card.kind
        const stat = element('div', 'release-stat', article)
        element('div', 'settings-kicker', stat).textContent = card.label
        element('div', 'release-count', stat).textContent = String(card.items.length)
        const items = element('ul', 'release-list', article)
        for (const item of card.items) richText(element('li', undefined, items), item)
      }
    }
    if (notes.omitted > 0) {
      element('p', 'settings-meta', body).textContent =
        notes.omitted === 1 ? 'One earlier release is in the full release notes.' : `${notes.omitted} earlier releases are in the full release notes.`
    }

    const foot = element('footer', 'whats-new-foot', panel)
    const all = element('a', 'plan-btn plan-btn-secondary', foot)
    all.href = RELEASES_URL
    all.textContent = 'All release notes'
    const done = element('button', 'plan-btn plan-btn-primary', foot)
    done.type = 'button'
    done.textContent = 'Continue'

    let closing = false
    function finish(seen: boolean): void {
      if (closing) return
      closing = true
      if (notesOpen?.version === version) notesOpen = null
      if (seen) follow(NOTICE_LINKS.notesSeen, dialog)
      backdrop.setAttribute('data-ending-style', '')
      panel.setAttribute('data-ending-style', '')
      const gone = () => {
        if (dialog.open) dialog.close()
        dialog.remove()
      }
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) gone()
      else setTimeout(gone, 220)
    }
    notesOpen = { version, close: finish }
    close.addEventListener('click', () => finish(true))
    done.addEventListener('click', () => finish(true))
    backdrop.addEventListener('click', () => finish(true))
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault()
      finish(true)
    })

    backdrop.setAttribute('data-starting-style', '')
    panel.setAttribute('data-starting-style', '')
    dialog.showModal()
    // The panel, not the close button, so the first key press does not dismiss the notes.
    panel.focus({ preventScroll: true })
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        backdrop.removeAttribute('data-starting-style')
        panel.removeAttribute('data-starting-style')
      }),
    )
  }

  return { update, whatsNew }
}

type NoticesWindow = Window & { __LIVING_PLAN_NOTICES__?: NoticesApi }

/** Run once per page, in its top frame. The app's calls wait for a body, which a page loads with. */
function install(): void {
  if (typeof window === 'undefined' || window.top !== window) return
  const win = window as NoticesWindow
  if (win.__LIVING_PLAN_NOTICES__) return
  const notices = createNotices()
  const whenReady = <T>(run: (value: T) => void) => (value: T) => {
    if (document.body) run(value)
    else document.addEventListener('DOMContentLoaded', () => run(value), { once: true })
  }
  const api: NoticesApi = Object.freeze({ update: whenReady(notices.update), whatsNew: whenReady(notices.whatsNew) })
  // Fixed, so a page's script cannot swap in its own.
  Object.defineProperty(win, '__LIVING_PLAN_NOTICES__', { value: api, writable: false, configurable: false, enumerable: false })
}

install()
