type PlanWindow = Window & {
  livingPlanPendingWorkflowFocus?: string | null
  __planChromeBound?: boolean
}

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

function focusWorkflowStep(ref: string): void {
  const canonical = decodeToken(ref)
  if (!canonical) return
  const win = window as PlanWindow
  win.livingPlanPendingWorkflowFocus = canonical
  activateTab('workflow')
  window.dispatchEvent(new CustomEvent('living-plan-focus-workflow', { detail: { ref: canonical } }))
  updateTocCurrent()
}

function focusPlanRef(ref: string): void {
  const section = findPlanTarget(ref)
  if (!section) return
  activateTab('plan')
  section.scrollIntoView({ behavior: 'smooth', block: 'center' })
  updateTocCurrent()
}

/** Plan and Workflow tabs, and the contents list, using the same controls as the local page. */
export function bindPlanChrome(): void {
  const win = window as PlanWindow
  if (win.__planChromeBound) return
  win.__planChromeBound = true
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
    setTocOpen(false)
    const kind = tocLink.getAttribute('data-toc')
    const ref = tocLink.getAttribute('data-toc-target') || ''
    if (kind === 'workflow') activateTab('workflow')
    else if (kind === 'workflow-step' && ref) focusWorkflowStep(ref)
    else if (ref) focusPlanRef(ref)
  })
  window.addEventListener('scroll', () => updateTocCurrent(), { passive: true })
  window.addEventListener('resize', () => setTocOpen(document.getElementById('plan-toc')?.dataset.open === 'true'))
  setTocOpen(false)
  updateTocCurrent()
}
