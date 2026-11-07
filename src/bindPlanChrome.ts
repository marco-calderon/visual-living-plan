type PlanWindow = Window & {
  livingPlanPendingWorkflowFocus?: string | null
  livingPlanFocusPlanRef?: (ref: string) => void
  livingPlanWorkflowFocusMissed?: () => void
  showPlanToast?: (message: string) => void
  __planChromeBound?: boolean
}

type ViewState = { tab: string; x: number; y: number; captured: boolean }

type JumpState = {
  livingPlanJump?: string
  livingPlanWorkflow?: string
  livingPlanPage?: string
  livingPlanView?: ViewState
}

let scrollGeneration = 0

function decodeToken(value: string): string {
  const raw = value.replace(/^#/, '')
  if (!raw) return ''
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

function findPlanTarget(token: string): HTMLElement | null {
  const decoded = decodeToken(token)
  if (!decoded) return null
  const ids = decoded.startsWith('plan-') ? [decoded, decoded.slice(5)] : [decoded, `plan-${decoded}`]
  for (const id of ids) {
    const byId = document.getElementById(id)
    if (byId) return byId
  }
  for (const ref of ids) {
    const byRef = document.querySelector(`[data-plan-ref="${CSS.escape(ref)}"]`)
    if (byRef instanceof HTMLElement) return byRef
  }
  return null
}

function activateTab(target: string): void {
  window.dispatchEvent(new CustomEvent('living-plan-activate-tab', { detail: { tab: target } }))
  document.querySelectorAll('[data-tab-target]').forEach((node) => {
    node.setAttribute('aria-selected', node.getAttribute('data-tab-target') === target ? 'true' : 'false')
  })
  document.querySelectorAll('[data-tab-panel]').forEach((panel) => {
    if (panel instanceof HTMLElement) panel.hidden = panel.getAttribute('data-tab-panel') !== target
  })
  const win = window as PlanWindow
  if (target !== 'workflow') win.livingPlanPendingWorkflowFocus = null
  if (target === 'workflow') requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
  updateTocCurrent()
}

function currentTab(): string {
  return document.querySelector('[data-tab-target][aria-selected="true"]')?.getAttribute('data-tab-target') || 'plan'
}

function updateTocCurrent(): void {
  const links = [...document.querySelectorAll('#plan-toc a[data-toc]')]
  if (links.length === 0) return
  const tab = currentTab()
  let current: Element | null = null
  if (tab === 'workflow') {
    const ref = (window as PlanWindow).livingPlanPendingWorkflowFocus || ''
    current =
      links.find((link) => link.getAttribute('data-toc') === 'workflow-step' && link.getAttribute('data-toc-target') === ref) ||
      links.find((link) => link.getAttribute('data-toc') === 'workflow') ||
      null
  } else if (tab === 'plan') {
    const line = window.scrollY + 96
    for (const link of links) {
      if (link.getAttribute('data-toc') !== 'section') continue
      const section = findPlanTarget(link.getAttribute('data-toc-target') || '')
      if (!section) continue
      const top = section.getBoundingClientRect().top + window.scrollY
      if (top <= line) current = link
    }
    if (!current) current = links.find((link) => link.getAttribute('data-toc') === 'section') || null
  }
  for (const link of links) {
    if (link === current) link.setAttribute('aria-current', 'true')
    else link.removeAttribute('aria-current')
  }
}

function tocIsDocked(): boolean {
  const nav = document.getElementById('plan-toc')
  if (!nav) return false
  return getComputedStyle(nav).getPropertyValue('--toc-dock').trim() === '1'
}

function setTocOpen(open: boolean): void {
  const nav = document.getElementById('plan-toc')
  const toggle = document.querySelector('[data-toc-toggle]')
  const backdrop = document.getElementById('plan-toc-backdrop')
  if (!nav) return
  const docked = tocIsDocked()
  const shown = docked || open
  nav.dataset.open = open && !docked ? 'true' : 'false'
  if (shown) {
    nav.removeAttribute('inert')
    nav.removeAttribute('aria-hidden')
  } else {
    nav.setAttribute('inert', '')
    nav.setAttribute('aria-hidden', 'true')
  }
  if (toggle) toggle.setAttribute('aria-expanded', open && !docked ? 'true' : 'false')
  if (backdrop instanceof HTMLElement) backdrop.hidden = docked || !open
}

function toast(message: string): void {
  ;(window as PlanWindow).showPlanToast?.(message)
}

function historyState(): JumpState {
  return history.state && typeof history.state === 'object' ? (history.state as JumpState) : {}
}

/** Save where the reader is on the current entry, so Back returns there. */
function snapshotView(): void {
  const view: ViewState = { tab: currentTab(), x: window.scrollX, y: window.scrollY, captured: true }
  history.replaceState({ ...historyState(), livingPlanView: view }, '')
}

function highlightPlanTarget(section: Element | null): void {
  document.querySelectorAll('.plan-ref-focus').forEach((node) => node.classList.remove('plan-ref-focus'))
  section?.classList.add('plan-ref-focus')
}

function scrollToPlanTarget(section: Element, instant: boolean): void {
  const generation = ++scrollGeneration
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const run = () => {
    if (generation !== scrollGeneration) return
    section.scrollIntoView({ behavior: instant || reduce ? 'auto' : 'smooth', block: 'center' })
  }
  if (instant || reduce) run()
  // The tab switch lays the plan out first.
  else requestAnimationFrame(() => requestAnimationFrame(run))
}

function pinScroll(x: number, y: number): void {
  const generation = scrollGeneration
  const apply = () => {
    if (generation === scrollGeneration) window.scrollTo({ left: x, top: y, behavior: 'instant' })
  }
  apply()
  requestAnimationFrame(() => {
    apply()
    requestAnimationFrame(apply)
  })
}

type JumpOptions = { recordHistory?: boolean; instant?: boolean }

function focusWorkflowStep(ref: string, options: JumpOptions = {}): void {
  const canonical = decodeToken(ref)
  if (!canonical) return
  if (options.recordHistory !== false) {
    const next = new URL(window.location.href)
    next.hash = `#workflow/${encodeURIComponent(canonical)}`
    if (!(historyState().livingPlanWorkflow === canonical && location.hash === next.hash)) {
      snapshotView()
      history.pushState({ livingPlanWorkflow: canonical }, '', next)
    }
  }
  highlightPlanTarget(null)
  const win = window as PlanWindow
  activateTab('workflow')
  win.livingPlanPendingWorkflowFocus = canonical
  window.dispatchEvent(new CustomEvent('living-plan-focus-workflow', { detail: { ref: canonical } }))
  updateTocCurrent()
}

function focusPlanRef(ref: string, options: JumpOptions = {}): void {
  const section = findPlanTarget(ref)
  if (!section) {
    if (options.recordHistory !== false) toast('No plan section for this step')
    return
  }
  const canonical = section.getAttribute('data-plan-ref') || section.id || decodeToken(ref)
  if (options.recordHistory !== false) {
    const next = new URL(window.location.href)
    next.hash = section.id ? `#${encodeURIComponent(section.id)}` : `#${encodeURIComponent(`plan-${canonical}`)}`
    if (!(historyState().livingPlanJump === canonical && location.hash === next.hash)) {
      snapshotView()
      history.pushState({ livingPlanJump: canonical }, '', next)
    }
  }
  activateTab('plan')
  highlightPlanTarget(section)
  scrollToPlanTarget(section, Boolean(options.instant))
  updateTocCurrent()
}

function focusPageTab(tab: string, options: JumpOptions = {}): void {
  if (tab !== 'plan' && tab !== 'workflow') return
  if (options.recordHistory !== false) {
    const next = new URL(window.location.href)
    next.hash = `#${tab}`
    if (!(historyState().livingPlanPage === tab && location.hash === next.hash)) {
      snapshotView()
      history.pushState({ livingPlanPage: tab }, '', next)
    }
  }
  highlightPlanTarget(null)
  ;(window as PlanWindow).livingPlanPendingWorkflowFocus = null
  activateTab(tab)
}

/** A link on the page that names a plan section: a same-page hash, or a bare id such as href="design". */
function tokenFromAnchor(link: HTMLAnchorElement): string {
  const href = link.getAttribute('href') || ''
  if (!href || href.slice(0, 11).toLowerCase() === 'javascript:') return ''
  let url: URL
  try {
    url = new URL(link.href, window.location.href)
  } catch {
    return ''
  }
  const sameDocument = url.origin === location.origin && url.pathname === location.pathname && url.search === location.search
  if (sameDocument && url.hash && findPlanTarget(url.hash)) return decodeToken(url.hash)
  if (!/[/?#:]/.test(href) && findPlanTarget(href)) return decodeToken(href)
  return ''
}

function workflowRefFromHash(hash: string): string {
  const decoded = decodeToken(hash)
  return decoded.startsWith('workflow/') ? decoded.slice('workflow/'.length) : ''
}

/** Plan and workflow links, and Back and Forward between them. */
function onJumpClick(event: MouseEvent): void {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  const target = event.target
  if (!(target instanceof Element) || target.closest('#plan-toc')) return
  const workflowJump = target.closest('[data-workflow-jump]')
  if (workflowJump) {
    // In comment mode a click picks the part to comment on.
    if (document.documentElement.dataset.comments === 'on') return
    const ref = workflowJump.getAttribute('data-workflow-jump')
    if (!ref) return
    event.preventDefault()
    focusWorkflowStep(ref)
    return
  }
  const planJump = target.closest('[data-plan-jump]')
  if (planJump) {
    const ref = planJump.getAttribute('data-plan-jump')
    if (!ref || !findPlanTarget(ref)) return
    event.preventDefault()
    focusPlanRef(ref)
    return
  }
  const link = target.closest('a[href]')
  if (!(link instanceof HTMLAnchorElement)) return
  const token = tokenFromAnchor(link)
  if (!token) return
  event.preventDefault()
  focusPlanRef(token)
}

function onPopState(): void {
  const state = historyState()
  const view = state.livingPlanView
  if (state.livingPlanJump && view?.captured) {
    scrollGeneration += 1
    if (view.tab) activateTab(view.tab)
    highlightPlanTarget(findPlanTarget(state.livingPlanJump))
    pinScroll(view.x || 0, view.y || 0)
    return
  }
  if (state.livingPlanJump) {
    focusPlanRef(state.livingPlanJump, { recordHistory: false, instant: true })
    return
  }
  if ((state.livingPlanPage === 'plan' || state.livingPlanPage === 'workflow') && !view?.captured) {
    focusPageTab(state.livingPlanPage, { recordHistory: false })
    return
  }
  if (view?.captured) {
    scrollGeneration += 1
    highlightPlanTarget(null)
    ;(window as PlanWindow).livingPlanPendingWorkflowFocus = null
    if (view.tab) activateTab(view.tab)
    pinScroll(view.x || 0, view.y || 0)
    if (view.tab === 'workflow' && state.livingPlanWorkflow) {
      ;(window as PlanWindow).livingPlanPendingWorkflowFocus = state.livingPlanWorkflow
      window.dispatchEvent(new CustomEvent('living-plan-focus-workflow', { detail: { ref: state.livingPlanWorkflow } }))
    }
    updateTocCurrent()
    return
  }
  if (state.livingPlanWorkflow) {
    focusWorkflowStep(state.livingPlanWorkflow, { recordHistory: false })
    return
  }
  openFromHash()
}

/** The address bar can name a step, a tab, or a plan section. */
function openFromHash(): boolean {
  const workflowRef = workflowRefFromHash(location.hash)
  if (workflowRef) {
    focusWorkflowStep(workflowRef, { recordHistory: false })
    return true
  }
  if (location.hash === '#workflow' || location.hash === '#plan') {
    focusPageTab(location.hash.slice(1), { recordHistory: false })
    return true
  }
  if (location.hash && findPlanTarget(location.hash)) {
    focusPlanRef(location.hash, { recordHistory: false, instant: true })
    return true
  }
  highlightPlanTarget(null)
  return false
}

function followTocLink(tocLink: Element): void {
  setTocOpen(false)
  const kind = tocLink.getAttribute('data-toc')
  const ref = tocLink.getAttribute('data-toc-target') || ''
  if (kind === 'workflow') focusPageTab('workflow')
  else if (kind === 'workflow-step' && ref) focusWorkflowStep(ref)
  else if (ref) focusPlanRef(ref)
}

type TocPress = { id: number; x: number; y: number; link: Element }

function tocLinkFrom(event: Event): Element | null {
  const target = event.target
  if (!(target instanceof Element)) return null
  return target.closest('#plan-toc a[data-toc]')
}

/** Plan and Workflow tabs, and the contents list, using the same controls as the local page. */
export function bindPlanChrome(): void {
  const win = window as PlanWindow
  if (win.__planChromeBound) return
  win.__planChromeBound = true
  // iPad taps the label or icon. WebKit treats :hover as the gesture and skips click.
  let tocPress: TocPress | null = null
  let tocPointerLink: Element | null = null
  let tocPointerAt = 0
  document.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' || !event.isPrimary || event.button !== 0) {
      tocPress = null
      return
    }
    const link = tocLinkFrom(event)
    tocPress = link ? { id: event.pointerId, x: event.clientX, y: event.clientY, link } : null
  })
  document.addEventListener('pointerup', (event) => {
    const press = tocPress
    tocPress = null
    if (!press || event.pointerId !== press.id) return
    const dx = event.clientX - press.x
    const dy = event.clientY - press.y
    if (dx * dx + dy * dy > 100) return
    const link = tocLinkFrom(event)
    if (!link || link !== press.link) return
    event.preventDefault()
    tocPointerLink = link
    tocPointerAt = Date.now()
    followTocLink(link)
  })
  document.addEventListener('pointercancel', (event) => {
    if (tocPress && event.pointerId === tocPress.id) tocPress = null
  })
  document.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const tab = target.closest('[data-tab-target]')
    if (tab) {
      const name = tab.getAttribute('data-tab-target')
      if (name === 'plan' || name === 'workflow') activateTab(name)
      return
    }
    const toggle = target.closest('[data-toc-toggle]')
    if (toggle) {
      const nav = document.getElementById('plan-toc')
      setTocOpen(nav?.dataset.open !== 'true')
      return
    }
    if (target.closest('#plan-toc-backdrop')) {
      setTocOpen(false)
      return
    }
    const tocLink = target.closest('#plan-toc a[data-toc]')
    if (!tocLink) return
    event.preventDefault()
    if (tocPointerLink === tocLink && Date.now() - tocPointerAt < 700) {
      tocPointerLink = null
      return
    }
    followTocLink(tocLink)
  })
  // Capture, so a plan link is handled before the router or the browser follows it.
  document.addEventListener('click', onJumpClick, true)
  window.addEventListener('popstate', onPopState)
  win.livingPlanFocusPlanRef = (ref: string) => focusPlanRef(ref)
  win.livingPlanWorkflowFocusMissed = () => toast('No workflow step for this section')
  // The plan renders after this runs. Open the section the address names once it is on the page.
  if (location.hash && !openFromHash()) {
    const onDocument = () => {
      if (openFromHash()) window.removeEventListener('living-plan-document', onDocument)
    }
    window.addEventListener('living-plan-document', onDocument)
    window.setTimeout(() => window.removeEventListener('living-plan-document', onDocument), 10_000)
  }
  window.addEventListener('scroll', () => updateTocCurrent(), { passive: true })
  window.addEventListener('resize', () => setTocOpen(document.getElementById('plan-toc')?.dataset.open === 'true'))
  setTocOpen(false)
  updateTocCurrent()
}
