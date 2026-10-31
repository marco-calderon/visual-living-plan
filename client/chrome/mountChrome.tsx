import { createRoot } from 'react-dom/client'
import { toast, Toaster } from 'sonner'
import { AccountMenu } from './AccountMenu.tsx'
import { CodeWrapSwitch } from './CodeWrapSwitch.tsx'
import { PlanDetails } from './PlanDetails.tsx'
import { PlansMenu } from './PlansMenu.tsx'
import { SettingsAccordion } from './SettingsAccordion.tsx'
import 'sonner/dist/styles.css'

declare global {
  interface Window {
    showPlanToast?: (message: string) => void
  }
}

function mountPlans() {
  const host = document.querySelector('[data-processes-root]')
  if (!(host instanceof HTMLElement) || host.dataset.plansMounted === 'true') return
  host.dataset.plansMounted = 'true'
  const selfId = host.getAttribute('data-self-id')
  createRoot(host).render(<PlansMenu selfId={selfId} />)
}

function mountPlanDetails() {
  const host = document.querySelector('[data-plan-details]')
  if (!(host instanceof HTMLElement) || host.dataset.detailsMounted === 'true') return
  const button = host.querySelector('[data-plan-details-toggle]')
  const card = host.querySelector('[data-plan-card]')
  if (!(button instanceof HTMLElement) || !(card instanceof HTMLElement)) return
  host.dataset.detailsMounted = 'true'
  const label = button.getAttribute('aria-label') ?? 'Plan details'
  const faceHtml = button.innerHTML
  const cardHtml = card.innerHTML
  createRoot(host).render(<PlanDetails label={label} faceHtml={faceHtml} cardHtml={cardHtml} />)
}

function mountAccordions() {
  document.querySelectorAll('[data-accordion]').forEach((node) => {
    if (!(node instanceof HTMLElement) || node.dataset.accordionMounted === 'true') return
    const trigger = node.querySelector('[data-accordion-trigger]')
    const panel = node.querySelector('[data-accordion-panel]')
    const inner = node.querySelector('.settings-accordion-panel-inner')
    if (!(trigger instanceof HTMLElement) || !(panel instanceof HTMLElement) || !(inner instanceof HTMLElement)) return
    const triggerId = trigger.id || 'diffs-theme-toggle'
    const panelId = panel.id || 'diffs-theme-panel'
    const triggerHtml = trigger.innerHTML
    const panelHtml = inner.innerHTML
    const host = document.createElement('div')
    host.dataset.accordionMounted = 'true'
    host.style.display = 'contents'
    node.replaceWith(host)
    createRoot(host).render(
      <SettingsAccordion
        triggerId={triggerId}
        panelId={panelId}
        triggerHtml={triggerHtml}
        panelHtml={panelHtml}
      />,
    )
  })
}

function mountCodeWrap() {
  const host = document.querySelector('[data-code-wrap]')
  if (!(host instanceof HTMLElement)) return
  const checked = document.documentElement.dataset.wrapCode === 'true'
  const slot = document.createElement('span')
  slot.className = 'code-wrap-control'
  host.replaceWith(slot)
  document.documentElement.dataset.codeWrapControl = 'react'
  createRoot(slot).render(<CodeWrapSwitch initialChecked={checked} />)
}

function mountAccountMenu() {
  const host = document.querySelector('[data-account-menu]')
  if (!(host instanceof HTMLElement) || host.dataset.accountMenuMounted === 'true') return
  const label = host.getAttribute('data-label') || 'Account'
  host.dataset.accountMenuMounted = 'true'
  const slot = document.createElement('div')
  slot.className = 'account-menu'
  host.replaceWith(slot)
  createRoot(slot).render(<AccountMenu label={label} />)
}

function mountToaster() {
  if (document.getElementById('plan-toaster-root')) return
  const legacy = document.getElementById('toast')
  if (legacy) legacy.hidden = true
  const host = document.createElement('div')
  host.id = 'plan-toaster-root'
  document.body.append(host)
  window.showPlanToast = (message: string) => {
    toast(message, { id: 'plan-toast', duration: 1600 })
  }
  createRoot(host).render(
    <Toaster
      position="top-left"
      offset={{ top: '4.5rem', left: '1rem' }}
      duration={1600}
      visibleToasts={1}
      toastOptions={{ className: 'plan-toast' }}
    />,
  )
}

document.documentElement.dataset.planChrome = 'react'
mountPlans()
mountPlanDetails()
mountAccordions()
mountCodeWrap()
mountAccountMenu()
mountToaster()
