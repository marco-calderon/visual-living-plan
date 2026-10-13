import Panzoom, { type PanzoomObject } from '@panzoom/panzoom'

const MIN_STAGE_HEIGHT = 160
const MAX_STAGE_HEIGHT = 480
const FALLBACK_STAGE_HEIGHT = 280
const PAN_STEP = 48

const INLINE_WHEEL_HINT = 'Drag to pan. Hold Ctrl or Command and scroll to zoom. Double-click to reset.'
const MAXIMIZED_WHEEL_HINT = 'Drag to pan. Scroll to zoom. Double-click to reset. Escape restores the page.'

const EXPAND_ICON = ['M3 6V3h3', 'M10 3h3v3', 'M13 10v3h-3', 'M6 13H3v-3']
const RESTORE_ICON = ['M6 3v3H3', 'M10 6V3h3', 'M13 10h-3v3', 'M3 10h3v3']

type MermaidViewer = {
  panzoom: PanzoomObject
  abort: AbortController
  observer: ResizeObserver
  fit: () => void
}

const viewers = new WeakMap<HTMLElement, MermaidViewer>()
const placeholders = new WeakMap<HTMLElement, HTMLElement>()
let watching = false
let maximized: HTMLElement | null = null

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function isMaximized(node: HTMLElement): boolean {
  return node.classList.contains('is-maximized')
}

function icon(commands: string[]): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.5')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  for (const command of commands) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', command)
    svg.append(path)
  }
  return svg
}

function controlButton(action: string, label: string, glyph: string[]): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'mermaid-control'
  button.dataset.mermaidZoom = action
  button.setAttribute('aria-label', label)
  button.title = label
  button.append(icon(glyph))
  return button
}

function createControls(): HTMLElement {
  const bar = document.createElement('div')
  bar.className = 'mermaid-controls'
  bar.setAttribute('role', 'toolbar')
  bar.setAttribute('aria-label', 'Diagram controls')
  bar.append(
    controlButton('out', 'Zoom out', ['M3 8h10']),
    controlButton('in', 'Zoom in', ['M8 3v10', 'M3 8h10']),
    controlButton('reset', 'Reset view', ['M3.5 8a4.5 4.5 0 1 0 1.3-3.2', 'M3.5 3.2V6.4H6.7']),
    controlButton('expand', 'Maximize diagram', EXPAND_ICON),
  )
  return bar
}

function stageHeight(svg: SVGSVGElement, width: number): number {
  const box = svg.viewBox.baseVal
  const fitted =
    box.width > 0 && box.height > 0 ? width * (box.height / box.width) : FALLBACK_STAGE_HEIGHT
  return Math.round(Math.max(MIN_STAGE_HEIGHT, Math.min(fitted, MAX_STAGE_HEIGHT)))
}

function prepareSvg(svg: SVGSVGElement): void {
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', 'Diagram')
  svg.removeAttribute('width')
  svg.removeAttribute('height')
  svg.style.width = '100%'
  svg.style.height = '100%'
  svg.style.maxWidth = 'none'
  svg.style.maxHeight = 'none'
}

function syncMaximizeChrome(node: HTMLElement): void {
  const expanded = isMaximized(node)
  const button = node.querySelector<HTMLButtonElement>('[data-mermaid-zoom="expand"]')
  const stage = node.querySelector<HTMLElement>('.mermaid-stage')
  if (button) {
    const label = expanded ? 'Restore diagram' : 'Maximize diagram'
    button.setAttribute('aria-label', label)
    button.title = label
    button.setAttribute('aria-pressed', expanded ? 'true' : 'false')
    button.querySelector('svg')?.replaceWith(icon(expanded ? RESTORE_ICON : EXPAND_ICON))
  }
  if (stage) stage.title = expanded ? MAXIMIZED_WHEEL_HINT : INLINE_WHEEL_HINT
}

function refit(node: HTMLElement): void {
  const view = viewers.get(node)
  if (!view) return
  view.fit()
  view.panzoom.reset({ animate: false })
}

export function collapseMermaidViewer(node: HTMLElement): void {
  if (!isMaximized(node)) return
  const spot = placeholders.get(node)
  node.classList.remove('is-maximized')
  if (spot?.isConnected && spot.parentNode) {
    spot.parentNode.insertBefore(node, spot)
    spot.remove()
  }
  placeholders.delete(node)
  if (maximized === node) maximized = null
  if (!document.querySelector('.mermaid-diagram.is-maximized')) {
    document.body.classList.remove('mermaid-maximized')
  }
  syncMaximizeChrome(node)
  refit(node)
  node.querySelector<HTMLButtonElement>('[data-mermaid-zoom="expand"]')?.focus()
}

function expandMermaidViewer(node: HTMLElement): void {
  if (isMaximized(node)) return
  if (maximized) collapseMermaidViewer(maximized)
  const parent = node.parentNode
  if (!parent) return
  const spot = document.createElement('div')
  spot.className = 'mermaid-placeholder'
  spot.setAttribute('aria-hidden', 'true')
  spot.style.height = `${node.offsetHeight}px`
  parent.insertBefore(spot, node)
  placeholders.set(node, spot)
  document.body.append(node)
  document.body.classList.add('mermaid-maximized')
  node.classList.add('is-maximized')
  maximized = node
  const stage = node.querySelector<HTMLElement>('.mermaid-stage')
  if (stage) stage.style.height = ''
  syncMaximizeChrome(node)
  requestAnimationFrame(() => {
    refit(node)
    node.querySelector<HTMLButtonElement>('[data-mermaid-zoom="expand"]')?.focus()
  })
}

function toggleMaximized(node: HTMLElement): void {
  if (isMaximized(node)) collapseMermaidViewer(node)
  else expandMermaidViewer(node)
}

function onControl(node: HTMLElement, panzoom: PanzoomObject, event: Event): void {
  const target = event.target
  if (!(target instanceof Element)) return
  const button = target.closest<HTMLButtonElement>('[data-mermaid-zoom]')
  const action = button?.dataset.mermaidZoom
  if (!action) return
  if (action === 'in') panzoom.zoomIn()
  if (action === 'out') panzoom.zoomOut()
  if (action === 'reset') panzoom.reset()
  if (action === 'expand') toggleMaximized(node)
}

function onStageKeydown(panzoom: PanzoomObject, event: KeyboardEvent): void {
  if (event.key === '+' || event.key === '=') {
    event.preventDefault()
    panzoom.zoomIn()
  } else if (event.key === '-' || event.key === '_') {
    event.preventDefault()
    panzoom.zoomOut()
  } else if (event.key === '0') {
    event.preventDefault()
    panzoom.reset()
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    panzoom.pan(-PAN_STEP, 0, { relative: true })
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    panzoom.pan(PAN_STEP, 0, { relative: true })
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    panzoom.pan(0, -PAN_STEP, { relative: true })
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    panzoom.pan(0, PAN_STEP, { relative: true })
  }
}

function onWheel(node: HTMLElement, panzoom: PanzoomObject, event: WheelEvent): void {
  if (!isMaximized(node) && !event.ctrlKey && !event.metaKey) return
  panzoom.zoomWithWheel(event)
}

function focusableIn(node: HTMLElement): HTMLElement[] {
  return [...node.querySelectorAll<HTMLElement>('button, [tabindex="0"]')].filter(
    (element) => !element.hasAttribute('disabled'),
  )
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (!maximized) return
  if (event.key === 'Escape') {
    event.preventDefault()
    collapseMermaidViewer(maximized)
    return
  }
  if (event.key !== 'Tab') return
  const items = focusableIn(maximized)
  const first = items[0]
  const last = items[items.length - 1]
  if (!first || !last) return
  const active = document.activeElement
  if (event.shiftKey && (active === first || !maximized.contains(active))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (active === last || !maximized.contains(active))) {
    event.preventDefault()
    first.focus()
  }
}

export function releaseMermaidViewer(node: HTMLElement): void {
  const view = viewers.get(node)
  if (!view) return
  view.abort.abort()
  view.observer.disconnect()
  view.panzoom.destroy()
  viewers.delete(node)
}

export function attachMermaidViewer(node: HTMLElement, svg: SVGSVGElement): void {
  releaseMermaidViewer(node)
  node.removeAttribute('role')
  node.removeAttribute('aria-label')

  const stage = document.createElement('div')
  stage.className = 'mermaid-stage'
  stage.tabIndex = 0
  stage.setAttribute('aria-label', 'Diagram viewer. Plus and minus zoom, zero resets, arrow keys pan.')
  stage.title = isMaximized(node) ? MAXIMIZED_WHEEL_HINT : INLINE_WHEEL_HINT

  prepareSvg(svg)
  stage.append(svg)
  const controls = createControls()
  node.replaceChildren(controls, stage)

  let lastWidth = 0
  const fit = (): void => {
    if (isMaximized(node)) {
      stage.style.height = ''
      lastWidth = 0
      return
    }
    const width = stage.clientWidth
    if (width <= 0 || width === lastWidth) return
    lastWidth = width
    stage.style.height = `${stageHeight(svg, width)}px`
  }
  fit()

  const panzoom = Panzoom(svg, {
    maxScale: 8,
    minScale: 0.5,
    step: 0.2,
    cursor: 'grab',
    animate: !prefersReducedMotion(),
    duration: prefersReducedMotion() ? 0 : 160,
  })

  const abort = new AbortController()
  const { signal } = abort

  controls.addEventListener('click', (event) => onControl(node, panzoom, event), { signal })
  stage.addEventListener('keydown', (event) => onStageKeydown(panzoom, event), { signal })
  stage.addEventListener('dblclick', () => panzoom.reset(), { signal })
  stage.addEventListener('wheel', (event) => onWheel(node, panzoom, event), { signal, passive: false })

  const observer = new ResizeObserver(() => fit())
  viewers.set(node, { panzoom, abort, observer, fit })
  observer.observe(stage)
  fit()
  syncMaximizeChrome(node)
}

export function watchMermaidViewer(): void {
  if (watching) return
  watching = true
  document.addEventListener('keydown', onDocumentKeydown)
}
