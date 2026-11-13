import { PLAN_EDIT_KEY, planEditTitle } from '../src/planEditButton.ts'

/** The heading the reader was at when they opened the editor. */
export type EditAnchor = { text: string }

type EditState = { editable: boolean; editing: boolean }

/**
 * Marks every toolbar Edit button for the plan's state. The toolbar is not part of this React root,
 * so the button is plain DOM: the page renders it, and only these attributes change.
 *
 * `body[data-plan-editable]` is absent while the plan is still rendering, so the button keeps its
 * place without showing, then `true` or `false`.
 */
export function markPlanEditButtons(state: { canEdit: boolean; ready: boolean; editable: boolean; editing: boolean; hasDraft: boolean }): void {
  const body = document.body
  if (state.canEdit && !state.ready) delete body.dataset.planEditable
  else body.dataset.planEditable = state.editable ? 'true' : 'false'
  for (const button of document.querySelectorAll<HTMLElement>('[data-plan-edit]')) {
    button.setAttribute('aria-pressed', state.editing ? 'true' : 'false')
    button.toggleAttribute('data-plan-has-draft', state.hasDraft && !state.editing)
    button.title = planEditTitle(state)
  }
}

/**
 * Opens the editor from the toolbar button or the E key. A second click closes it through the
 * editor's own Close, which keeps the draft and is disabled while a version publishes.
 * Returns the cleanup.
 */
export function bindPlanEditButton(options: { state: () => EditState; open: (anchor: EditAnchor | null) => void }): () => void {
  const open = () => {
    const state = options.state()
    if (!state.editable || state.editing) return
    // Read the place before the tab changes. The plan tab may be hidden behind Workflow or Settings.
    // A key pressed with focus inside a block opens at that block.
    const anchor = focusedBlockAnchor() ?? readerHeading()
    showPlanTab()
    options.open(anchor)
  }
  const onClick = (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof Element) || !target.closest('[data-plan-edit]')) return
    if (options.state().editing) {
      document.querySelector<HTMLButtonElement>('[data-plan-editor-close]')?.click()
      return
    }
    open()
  }
  const onKey = (event: KeyboardEvent) => {
    if (event.key.toUpperCase() !== PLAN_EDIT_KEY) return
    if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return
    const target = event.target
    if (target instanceof HTMLElement && (target.closest('input, textarea, select') || target.isContentEditable)) return
    const state = options.state()
    if (!state.editable || state.editing) return
    event.preventDefault()
    open()
  }
  document.addEventListener('click', onClick)
  document.addEventListener('keydown', onKey)
  return () => {
    document.removeEventListener('click', onClick)
    document.removeEventListener('keydown', onKey)
  }
}

/** Switches to the Plan tab when Workflow or Settings is showing. Tab clicks are history steps, as elsewhere. */
function showPlanTab(): void {
  const tab = document.querySelector<HTMLElement>('[data-tab-target="plan"]')
  if (tab && tab.getAttribute('aria-selected') !== 'true') tab.click()
}

function headingText(element: Element): string {
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** The line, from the top of the window, that the contents list marks the current section by (src/bindPlanChrome.ts). */
const READING_LINE = 96

/** The last plan heading at or above the reading line, or null at the top of the page. */
function readerHeading(): EditAnchor | null {
  const article = document.querySelector('[data-plan-rendered]')
  if (!article || article.closest('[hidden]') || window.scrollY < 1) return null
  let found: EditAnchor | null = null
  for (const heading of article.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    if (heading.getBoundingClientRect().top > READING_LINE) break
    const text = headingText(heading)
    if (text) found = { text }
  }
  return found
}

/** How long the editor may take to load and lay out its first page. */
const EDITOR_READY_MS = 4000
/** How long the place is held while diagrams and code blocks above it finish laying out. */
const EDITOR_HOLD_MS = 8000

/** What the reader does that means they have taken over the scroll position. */
const READER_INPUT = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const

/**
 * Brings the editor's heading or card title with the anchor's text to the top of the reading area,
 * below the toolbar and the editor's sticky bar. Diagrams and highlighted code above it grow after
 * the editor opens, so the place is held each time the editor changes size, until the reader scrolls,
 * taps, or types. Without an anchor, or when the heading is not found, the editor opens at the top,
 * where its bar is. Returns a cancel for a close.
 */
export function scrollEditorToHeading(anchor: EditAnchor | null): () => void {
  if (!anchor) {
    window.scrollTo({ top: 0 })
    return () => {}
  }
  const text = anchor.text
  let frame = 0
  let observer: ResizeObserver | null = null
  let timer = 0
  const started = performance.now()
  const stop = () => {
    cancelAnimationFrame(frame)
    observer?.disconnect()
    window.clearTimeout(timer)
    for (const type of READER_INPUT) window.removeEventListener(type, stop, true)
  }
  const align = (editor: Element): boolean => {
    const match = findEditorPlace(editor, text)
    if (!match) return false
    const bar = editor.querySelector<HTMLElement>('.plan-editor-bar')
    const barBottom = bar ? (Number.parseFloat(getComputedStyle(bar).top) || 0) + bar.offsetHeight : 0
    const offset = match.getBoundingClientRect().top - barBottom - 16
    if (Math.abs(offset) > 2) window.scrollTo({ top: window.scrollY + offset })
    return true
  }
  const find = () => {
    const editor = document.querySelector('.plan-editor')
    if (editor && align(editor)) {
      observer = new ResizeObserver(() => align(editor))
      observer.observe(editor)
      timer = window.setTimeout(stop, EDITOR_HOLD_MS)
      return
    }
    if (performance.now() - started > EDITOR_READY_MS) {
      window.scrollTo({ top: 0 })
      return stop()
    }
    frame = requestAnimationFrame(find)
  }
  for (const type of READER_INPUT) window.addEventListener(type, stop, { capture: true, passive: true })
  frame = requestAnimationFrame(find)
  return stop
}

/** Prose headings stay headings in the editor. A phase or card title becomes its title field. */
function findEditorPlace(editor: Element, text: string): Element | undefined {
  return [...editor.querySelectorAll('h1, h2, h3, h4, h5, h6, input, textarea')].find((node) =>
    node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement
      ? node.value.replace(/\s+/g, ' ').trim() === text
      : headingText(node) === text,
  )
}

/* ----------------------------------------------------------------------------------------------
 * Edit one block (ADR 0039). While the plan can be edited, the block under the pointer shows a
 * small Edit pill at its top right. It opens the same editor as the toolbar, at that block. One
 * button follows the pointer, so the page's blocks stay as React drew them.
 * ------------------------------------------------------------------------------------------- */

/** The plan's top-level block that holds `target`, or null outside the plan. */
export function planBlockOf(target: EventTarget | null): HTMLElement | null {
  const article = document.querySelector('[data-plan-rendered]')
  if (!article || !(target instanceof Element) || !article.contains(target) || target === article) return null
  let node: Element | null = target
  while (node && node.parentElement !== article) node = node.parentElement
  return node instanceof HTMLElement ? node : null
}

/** A block the plan marks `locked`, or an answer card (form, questions) that keeps its default lock. */
export function isEditLocked(block: Element): boolean {
  return block.matches('[data-edit-locked="true"]') || block.querySelector(':scope > [data-edit-locked="true"]') !== null
}

const BLOCK_TITLE = '.plan-step-label, .plan-title, h1, h2, h3, h4, h5, h6'

/** The text the editor finds the block by: its own title or prompt, or the heading above it. */
export function blockAnchor(block: Element): EditAnchor | null {
  if (/^H[1-6]$/.test(block.tagName)) {
    const text = headingText(block)
    return text ? { text } : null
  }
  const label = block.querySelector('.plan-callout-label .plan-card-label-text')
  if (label) {
    const parts = headingText(label).split(' · ')
    if (parts.length > 1) return { text: parts.slice(1).join(' · ') }
  }
  const own = block.querySelector(BLOCK_TITLE)
  if (own) {
    const text = headingText(own)
    if (text) return { text }
  }
  for (let node = block.previousElementSibling; node; node = node.previousElementSibling) {
    const heading = /^H[1-6]$/.test(node.tagName) ? node : node.querySelector(BLOCK_TITLE)
    if (!heading) continue
    const text = headingText(heading)
    if (text) return { text }
  }
  return null
}

function focusedBlockAnchor(): EditAnchor | null {
  const block = planBlockOf(document.activeElement)
  if (!block || isEditLocked(block)) return null
  return blockAnchor(block)
}

const PENCIL =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>'

/** How long the pill waits after the pointer leaves a block, so it can be reached. */
const HIDE_DELAY_MS = 300

export function bindBlockEditButton(options: { state: () => EditState; open: (anchor: EditAnchor | null) => void }): () => void {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'plan-block-edit'
  button.dataset.planBlockEdit = ''
  button.tabIndex = -1
  button.setAttribute('aria-label', 'Edit this block')
  button.innerHTML = `${PENCIL}<span>Edit</span>`
  document.body.append(button)
  let block: HTMLElement | null = null
  let frame = 0
  let hideTimer = 0

  const hide = () => {
    window.clearTimeout(hideTimer)
    block = null
    button.removeAttribute('data-visible')
  }
  const place = () => {
    if (!block || !block.isConnected) return hide()
    const rect = block.getBoundingClientRect()
    if (rect.bottom < 0 || rect.top > window.innerHeight) return hide()
    const width = button.offsetWidth || 64
    const height = button.offsetHeight || 26
    // Beside the block's first line (a phase's padding puts its title below the hairline), in the
    // gutter right of the column when there is room, over the block's corner when there is not.
    const padTop = Number.parseFloat(getComputedStyle(block).paddingTop) || 0
    const titleBar = document.querySelector('header.titlebar')?.getBoundingClientRect().bottom ?? 0
    const roomRight = window.innerWidth - rect.right >= width + 24
    const left = roomRight ? rect.right + 12 : Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))
    const firstLine = roomRight ? rect.top + padTop : rect.top + padTop - height - 4
    // Never under the toolbar: a block whose top has scrolled away keeps the pill below the bar.
    const top = Math.min(Math.max(firstLine, titleBar + 8), rect.bottom - height)
    button.style.top = `${top + window.scrollY}px`
    button.style.left = `${left + window.scrollX}px`
  }
  const show = (next: HTMLElement) => {
    window.clearTimeout(hideTimer)
    block = next
    button.setAttribute('data-visible', '')
    place()
  }
  const usable = () => {
    const state = options.state()
    return state.editable && !state.editing
  }
  const track = (target: EventTarget | null) => {
    if (target === button || button.contains(target as Node)) {
      window.clearTimeout(hideTimer)
      return
    }
    const next = usable() ? planBlockOf(target) : null
    if (next && !isEditLocked(next)) {
      if (next !== block || !button.hasAttribute('data-visible')) show(next)
      return
    }
    if (!block) return
    window.clearTimeout(hideTimer)
    hideTimer = window.setTimeout(hide, HIDE_DELAY_MS)
  }
  const onPointer = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return
    const target = event.target
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => track(target))
  }
  const onMove = () => {
    if (block) place()
  }
  const onClick = () => {
    const target = block
    hide()
    if (!target || !usable()) return
    options.open(blockAnchor(target))
  }
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') hide()
  }
  button.addEventListener('click', onClick)
  document.addEventListener('pointerover', onPointer, { passive: true })
  document.addEventListener('keydown', onKey)
  window.addEventListener('scroll', onMove, { passive: true })
  window.addEventListener('resize', onMove)
  return () => {
    cancelAnimationFrame(frame)
    window.clearTimeout(hideTimer)
    button.removeEventListener('click', onClick)
    document.removeEventListener('pointerover', onPointer)
    document.removeEventListener('keydown', onKey)
    window.removeEventListener('scroll', onMove)
    window.removeEventListener('resize', onMove)
    button.remove()
  }
}
