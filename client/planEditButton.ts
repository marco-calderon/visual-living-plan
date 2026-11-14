/* ----------------------------------------------------------------------------------------------
 * Edit a block where it sits (ADR 0040). The page is both the reader and the editor: while the
 * plan can be edited, a click on text (a paragraph, a heading, a list, a quote, a table cell) puts
 * the caret there and the text is edited as it reads. A block that is more than text (a card, a
 * choice, an endpoint, a diagram, code, a table) shows a small pill with Edit and + while it is
 * under the pointer, has focus, or is tapped. Edit opens that block's editor in its place; + opens
 * a new block below it. E edits the block under the pointer or with focus, or the one at the
 * reading line. One pill follows the pointer, so the page's blocks stay as React drew them.
 * ------------------------------------------------------------------------------------------- */

import { textOffsetAt } from './caretSpot.ts'

/** The key that edits the block with focus. */
export const BLOCK_EDIT_KEY = 'E'

type EditState = { editable: boolean; editing: boolean }

/** Where the caret goes when an editor opens: characters into the text, in a data table's cell when `row` is set. */
export type EditCaret = { offset: number; row?: number; column?: number }

/** How a block's editor opens. Text opens `inline`: it keeps its look and place, with no frame or bar. */
export type EditHow = {
  inline?: boolean
  caret?: EditCaret
  /** The space the block keeps around its text, so the text does not move when it turns into the editor. */
  margins?: { top: string; bottom: string }
}

export type BlockEditActions = {
  state: () => EditState
  /** Open the editor for the block at this range (its `data-plan-block`). */
  edit: (range: string, how?: EditHow) => void
  /** Open a new block's editor after the block at this range. */
  add: (after: string) => void
  /** Edit one cell of a pipe table where it is (its `data-plan-cell-range`). */
  cell: (range: string, caret?: EditCaret) => void
}

/** What `bindBlockEditButton` returns: stop listening, and tell it the open editor closed. */
export type BlockEditBinding = {
  stop: () => void
  /** A click on other text while an editor was open finishes that editor first; this opens the text it hit. */
  closed: () => void
}

function article(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-plan-rendered]')
}

/** The innermost block with a place in the plan file (`data-plan-block`) that holds `target`. */
export function editTargetOf(target: EventTarget | null): HTMLElement | null {
  const root = article()
  if (!root || !(target instanceof Element) || !root.contains(target)) return null
  if (target.closest('[data-plan-block-editor]')) return null
  const block = target.closest<HTMLElement>('[data-plan-block]')
  return block && root.contains(block) ? block : null
}

/** Text the page edits as it reads: no pill, a click puts the caret in it. */
const TEXT_BLOCK = 'p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote'

export function isTextBlock(block: Element): boolean {
  return block.matches(TEXT_BLOCK)
}

/** The block the pill is for: the innermost block under `target` that is more than text, such as the phase a paragraph is in. */
export function pillTargetOf(target: EventTarget | null): HTMLElement | null {
  const root = article()
  let block = editTargetOf(target)
  while (block && isTextBlock(block)) {
    const outer = block.parentElement?.closest<HTMLElement>('[data-plan-block]') ?? null
    block = outer && root?.contains(outer) ? outer : null
  }
  return block
}

/** A block the plan marks `locked`, or one inside a locked block, or an answer card that keeps its default lock. */
export function isEditLocked(block: Element): boolean {
  return block.closest('[data-edit-locked="true"]') !== null || block.querySelector(':scope > [data-edit-locked="true"]') !== null
}

/** Controls inside text that keep their own click: links, buttons, checkboxes, fields. */
const OWN_CLICK =
  'a[href], button, input, select, textarea, label, summary, [contenteditable="true"], [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="menuitem"], [role="option"]'

/** What a click on `target` edits where it is: text, a pipe table's cell, or a data table's cell. */
export type DirectEdit =
  | { kind: 'text'; element: HTMLElement }
  | { kind: 'cell'; element: HTMLElement }
  | { kind: 'grid'; element: HTMLElement; block: HTMLElement; row: number; column: number }

export function directEditOf(target: EventTarget | null): DirectEdit | null {
  if (!(target instanceof Element) || target.closest(OWN_CLICK)) return null
  const block = editTargetOf(target)
  if (!block || isEditLocked(block)) return null
  if (isTextBlock(block)) return { kind: 'text', element: block }
  const cell = target.closest<HTMLElement>('td, th')
  if (!cell || !block.contains(cell)) return null
  if (cell.hasAttribute('data-plan-cell-range')) return { kind: 'cell', element: cell }
  // A data table's row keeps its place in the plan in its id (`row-3` is the third <Row>), whatever the sort.
  const row = /^row-(\d+)$/.exec(cell.closest('tr')?.getAttribute('data-row') ?? '')
  const table = cell.closest('[data-plan-data-table]')
  // Only a data table that is a block of its own (its frame); one inside a card opens with that card's Edit.
  if (row && cell.tagName === 'TD' && table && block.matches('.plan-block-frame') && block.querySelector('[data-plan-data-table]') === table && !cell.closest('[data-edit-locked="true"]')) {
    const column = Array.prototype.indexOf.call(cell.parentElement?.children ?? [], cell) as number
    return { kind: 'grid', element: cell, block, row: Number(row[1]) - 1, column }
  }
  return null
}

/** True while the reader has text selected: a drag over text selects it rather than editing it. */
function selecting(): boolean {
  const selection = window.getSelection()
  return selection !== null && selection.rangeCount > 0 && !selection.isCollapsed
}

/** The line, from the top of the window, that the contents list marks the current section by (src/bindPlanChrome.ts). */
const READING_LINE = 96

/** The first top-level block that reaches below the reading line, for E with nothing focused. */
function blockAtReadingLine(): HTMLElement | null {
  const root = article()
  if (!root) return null
  for (const child of root.children) {
    if (!(child instanceof HTMLElement) || !child.matches('[data-plan-block]') || isEditLocked(child)) continue
    if (child.getBoundingClientRect().bottom > READING_LINE) return child
  }
  return null
}

/** Switches to the Plan tab when Workflow or Settings is showing. Tab clicks are history steps, as elsewhere. */
function showPlanTab(): boolean {
  const tab = document.querySelector<HTMLElement>('[data-tab-target="plan"]')
  if (!tab || tab.getAttribute('aria-selected') === 'true') return false
  tab.click()
  return true
}

const PENCIL =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>'

const PLUS =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>'

/** How long the pill waits after the pointer leaves a block, so it can be reached. */
const HIDE_DELAY_MS = 300

/** How long a press on text waits for the editor it finished to close. */
const QUEUE_MS = 3000

/** Where in `element`'s text a click at x, y is, for the editor's caret. */
function caretIn(element: Element, x: number, y: number): EditCaret | undefined {
  const offset = textOffsetAt(element, x, y)
  return offset === null ? undefined : { offset }
}

const STACKED = ['block', 'list-item']

/**
 * The space a block keeps above or below its text: its own margin, collapsed with the margin of its
 * first (or last) child where nothing separates them, as a quote's paragraph does. The editor that
 * stands in for the block takes that space, so the text does not move.
 */
function collapsedMargin(element: Element, side: 'top' | 'bottom'): number {
  let value = 0
  let node: Element | null = element
  while (node) {
    const style = getComputedStyle(node)
    value = Math.max(value, Number.parseFloat(side === 'top' ? style.marginTop : style.marginBottom) || 0)
    const edge =
      side === 'top'
        ? (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.borderTopWidth) || 0)
        : (Number.parseFloat(style.paddingBottom) || 0) + (Number.parseFloat(style.borderBottomWidth) || 0)
    if (edge > 0 || style.overflow !== 'visible' || !STACKED.includes(style.display)) break
    const child: Element | null = side === 'top' ? node.firstElementChild : node.lastElementChild
    if (!child || !STACKED.includes(getComputedStyle(child).display)) break
    node = child
  }
  return value
}

function marginsOf(element: Element): { top: string; bottom: string } {
  return { top: `${collapsedMargin(element, 'top')}px`, bottom: `${collapsedMargin(element, 'bottom')}px` }
}

function toolButton(className: string, label: string, title: string, html: string): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = className
  // The keyboard's way in is E, which edits the block that has focus.
  button.tabIndex = -1
  button.setAttribute('aria-label', label)
  button.title = title
  button.innerHTML = html
  return button
}

export function bindBlockEditButton(options: BlockEditActions): BlockEditBinding {
  const tools = document.createElement('div')
  tools.className = 'plan-block-tools'
  tools.dataset.planBlockTools = ''
  tools.setAttribute('role', 'toolbar')
  tools.setAttribute('aria-label', 'Block')
  const edit = toolButton('plan-block-edit', 'Edit this block', `Edit this block (${BLOCK_EDIT_KEY})`, `${PENCIL}<span>Edit</span>`)
  edit.dataset.planBlockEdit = ''
  edit.setAttribute('aria-keyshortcuts', BLOCK_EDIT_KEY)
  const add = toolButton('plan-block-add-below', 'Add a block below', 'Add a block below', PLUS)
  add.dataset.planBlockAdd = ''
  tools.append(edit, add)
  document.body.append(tools)
  let block: HTMLElement | null = null
  // The innermost block under the pointer, with focus, or tapped, text included: what E edits.
  let pointed: HTMLElement | null = null
  let frame = 0
  let hideTimer = 0

  const hide = () => {
    window.clearTimeout(hideTimer)
    block = null
    tools.removeAttribute('data-visible')
  }
  const place = () => {
    if (!block || !block.isConnected) return hide()
    const rect = block.getBoundingClientRect()
    if (rect.bottom < 0 || rect.top > window.innerHeight) return hide()
    const width = tools.offsetWidth || 92
    const height = tools.offsetHeight || 26
    // Beside the block's first line (a phase's padding puts its title below the hairline), in the
    // gutter right of the column when there is room, over the block's corner when there is not.
    const padTop = Number.parseFloat(getComputedStyle(block).paddingTop) || 0
    const titleBar = document.querySelector('header.titlebar')?.getBoundingClientRect().bottom ?? 0
    const roomRight = window.innerWidth - rect.right >= width + 24
    const left = roomRight ? rect.right + 12 : Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))
    const firstLine = roomRight ? rect.top + padTop : rect.top + padTop - height - 4
    // Never under the toolbar: a block whose top has scrolled away keeps the pill below the bar.
    const top = Math.min(Math.max(firstLine, titleBar + 8), rect.bottom - height)
    tools.style.top = `${top + window.scrollY}px`
    tools.style.left = `${left + window.scrollX}px`
  }
  const show = (next: HTMLElement) => {
    window.clearTimeout(hideTimer)
    block = next
    tools.setAttribute('data-visible', '')
    place()
  }
  const usable = () => {
    const state = options.state()
    // In comment mode a click picks a part to comment on, so the pill stays away.
    return state.editable && !state.editing && document.body.dataset.planMode !== 'comment'
  }
  const track = (target: EventTarget | null) => {
    if (target instanceof Node && tools.contains(target)) {
      window.clearTimeout(hideTimer)
      return
    }
    const inner = usable() ? editTargetOf(target) : null
    pointed = inner && !isEditLocked(inner) ? inner : null
    const next = inner ? pillTargetOf(target) : null
    if (next && !isEditLocked(next)) {
      // Back on the block after a trip to the pill: the hide that leaving it started is off.
      window.clearTimeout(hideTimer)
      if (next !== block || !tools.hasAttribute('data-visible')) show(next)
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
  // A touch screen has no hover: a tap on a block shows its pill.
  const onTap = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') return
    track(event.target)
  }
  const onMove = () => {
    if (block) place()
  }
  const run = (action: 'edit' | 'add') => {
    const target = block
    hide()
    const range = target?.dataset.planBlock
    if (!range || !usable()) return
    if (action === 'edit') options.edit(range)
    else options.add(range)
  }
  const onEdit = () => run('edit')
  const onAdd = () => run('add')
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      hide()
      return
    }
    if (event.key.toUpperCase() !== BLOCK_EDIT_KEY) return
    if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return
    const target = event.target
    if (target instanceof HTMLElement && (target.closest('input, textarea, select') || target.isContentEditable)) return
    if (!usable()) return
    event.preventDefault()
    // From Workflow or Settings, E shows the plan first.
    if (showPlanTab()) return
    const hovered = pointed?.isConnected ? pointed : null
    const focused = editTargetOf(document.activeElement)
    const next = [hovered, focused && !isEditLocked(focused) ? focused : null, blockAtReadingLine()].find(
      (candidate): candidate is HTMLElement => Boolean(candidate?.dataset.planBlock),
    )
    hide()
    if (!next?.dataset.planBlock) return
    options.edit(next.dataset.planBlock, isTextBlock(next) ? { inline: true, margins: marginsOf(next) } : undefined)
  }
  /** Where the caret goes for a click at x, y on `direct`. */
  const caretFor = (direct: DirectEdit, x: number, y: number): EditCaret | undefined => {
    if (direct.kind !== 'grid') return caretIn(direct.element, x, y)
    return { row: direct.row, column: direct.column, offset: textOffsetAt(direct.element, x, y) ?? Number.MAX_SAFE_INTEGER }
  }
  const openDirect = (direct: DirectEdit, caret: EditCaret | undefined) => {
    hide()
    if (direct.kind === 'cell') {
      const range = direct.element.getAttribute('data-plan-cell-range')
      if (range) options.cell(range, caret)
      return
    }
    const range = (direct.kind === 'grid' ? direct.block : direct.element).dataset.planBlock
    if (!range) return
    if (direct.kind === 'grid') options.edit(range, { caret })
    else options.edit(range, { inline: true, caret, margins: marginsOf(direct.element) })
  }
  const plainPress = (event: MouseEvent) =>
    event.button === 0 && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
  // A press on other text while an editor is open finishes that editor (client/editor/BlockEditor.tsx);
  // that text opens once the page shows the edit. A mouse is taken at the press, since the page can
  // move before the release; a finger at the tap, since a press may start a scroll.
  let queued: { direct: DirectEdit; caret: EditCaret | undefined; text: string; at: number } | null = null
  const queue = (event: MouseEvent): boolean => {
    const state = options.state()
    if (!state.editable || !state.editing || document.body.dataset.planMode === 'comment') return false
    const direct = directEditOf(event.target)
    if (direct) queued = { direct, caret: caretFor(direct, event.clientX, event.clientY), text: direct.element.textContent ?? '', at: Date.now() }
    return true
  }
  const onPress = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return
    queued = null
    if (plainPress(event)) queue(event)
  }
  const onClick = (event: MouseEvent) => {
    if (!plainPress(event) || event.defaultPrevented) return
    if ((event as PointerEvent).pointerType === 'touch' && queue(event)) return
    if (!usable()) return
    const direct = directEditOf(event.target)
    if (!direct || selecting()) return
    openDirect(direct, caretFor(direct, event.clientX, event.clientY))
  }
  const closed = () => {
    const next = queued
    queued = null
    if (!next || Date.now() - next.at > QUEUE_MS || !usable() || selecting()) return
    // The text pressed on is still there, unless the edit changed it.
    if (!next.direct.element.isConnected || (next.direct.element.textContent ?? '') !== next.text) return
    openDirect(next.direct, next.caret)
  }
  // Focus moving into a block (a folder, a tab, a link) shows its pill too, and E edits it.
  const onFocus = (event: FocusEvent) => {
    if (event.target instanceof Node && tools.contains(event.target)) return
    track(event.target)
  }
  edit.addEventListener('click', onEdit)
  add.addEventListener('click', onAdd)
  document.addEventListener('click', onClick)
  document.addEventListener('pointerdown', onPress, { passive: true })
  document.addEventListener('pointerover', onPointer, { passive: true })
  document.addEventListener('pointerup', onTap, { passive: true })
  document.addEventListener('focusin', onFocus)
  document.addEventListener('keydown', onKey)
  window.addEventListener('scroll', onMove, { passive: true })
  window.addEventListener('resize', onMove)
  const stop = () => {
    cancelAnimationFrame(frame)
    window.clearTimeout(hideTimer)
    queued = null
    edit.removeEventListener('click', onEdit)
    add.removeEventListener('click', onAdd)
    document.removeEventListener('click', onClick)
    document.removeEventListener('pointerdown', onPress)
    document.removeEventListener('pointerover', onPointer)
    document.removeEventListener('pointerup', onTap)
    document.removeEventListener('focusin', onFocus)
    document.removeEventListener('keydown', onKey)
    window.removeEventListener('scroll', onMove)
    window.removeEventListener('resize', onMove)
    tools.remove()
  }
  return { stop, closed }
}
