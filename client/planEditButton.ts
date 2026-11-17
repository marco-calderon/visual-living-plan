/* ----------------------------------------------------------------------------------------------
 * Edit a block where it sits (ADR 0040). The page is both the reader and the editor: while the
 * plan can be edited, a click on text (a paragraph, a heading, a list, a quote, a table cell, the
 * text inside a card, or a card's title) puts the caret there and the text is edited as it reads.
 * A block that is more than text (a card, a choice, an endpoint, a diagram, code, a table) shows
 * a small Edit pill beside it while it is under the pointer, has focus, or is tapped: Edit opens
 * that block's own editor in its place. Every block, text included, shows a + bar in the gap under
 * it, and a block inside a phase shows the phase's bar too: + opens a new, empty line there, edited
 * as text reads. E edits the block under the pointer or with focus, or the one at the reading line.
 * One pill and two bars follow the pointer, so the page's blocks stay as React drew them.
 * ------------------------------------------------------------------------------------------- */

import { barFit } from './addBar.ts'
import { textOffsetAt } from './caretSpot.ts'
import { isTap, isTouchPointer } from './pointerKind.ts'

/** The key that edits the block with focus. */
export const BLOCK_EDIT_KEY = 'E'

/** The key that adds a block below the block with focus, or the one under the pointer. */
export const BLOCK_ADD_KEY = 'A'

type EditState = { editable: boolean; editing: boolean }

/** Where the caret goes when an editor opens: characters into the text, in a data table's cell when `row` is set. */
export type EditCaret = { offset: number; row?: number; column?: number }

/**
 * What opens once an editor closes, found by a block's `start` in the plan file the page draws next.
 * After Enter: the block after the one at `start` (the text after the caret), or an empty new block
 * after it. After Backspace removed an empty block: the block at `start`, with the caret at its end
 * (the block above) or at its start (the block below, when there was none above).
 */
export type EditFollow = { open: 'next' | 'add' | 'end' | 'start'; start: number }

/** How a block's editor opens. Text opens `inline`: it keeps its look and place, with no frame or bar. */
export type EditHow = {
  inline?: boolean
  caret?: EditCaret
  /** The space the block keeps around its text, so the text does not move when it turns into the editor. */
  margins?: { top: string; bottom: string }
  /** The height of the text it stands in for, held while the editor's own text comes in. */
  height?: number
}

export type BlockEditActions = {
  state: () => EditState
  /** Open the editor for the block at this range (its `data-plan-block`). */
  edit: (range: string, how?: EditHow) => void
  /** Open a new block's editor after the block at this range. */
  add: (after: string, how?: EditHow) => void
  /** Edit one cell of a pipe table where it is (its `data-plan-cell-range`). */
  cell: (range: string, caret?: EditCaret) => void
  /** Edit a card's title where it reads: `element` is its text, `attr` the attribute it comes from, `block` the card's range. */
  title: (element: HTMLElement, block: string, attr: string, caret?: EditCaret) => void
  /** Finish the open editor or title, keeping what was typed: the pill's Edit or + was pressed while it was open. */
  finish: () => void
}

/** What `bindBlockEditButton` returns: stop listening, and tell it the open editor closed. */
export type BlockEditBinding = {
  stop: () => void
  /** A click on other text while an editor was open finishes that editor first; this opens the text it hit. */
  closed: () => void
  /** An editor opened or closed: the card whose text or title is open keeps its pill beside it. */
  refresh: () => void
}

/**
 * The card whose text or title is open on the page: a callout, an update, a choice. Its pill stays
 * beside it while the text is edited, so its Edit is there. A phase is the card of its title, not
 * of the text inside it, whose own pill is + alone.
 */
function cardOfOpenText(): HTMLElement | null {
  const root = article()
  const title = root?.querySelector<HTMLElement>('[data-plan-title-editing]')
  const text = title ? null : root?.querySelector<HTMLElement>('[data-plan-block-editor][data-inline]:not([data-plan-block-editor="cell"])')
  const open = title ?? text
  const card = open?.parentElement?.closest<HTMLElement>('[data-plan-block]') ?? null
  if (!root || !card || !root.contains(card) || isTextBlock(card) || isEditLocked(card)) return null
  if (text && card.matches('[data-entry="phase"]')) return null
  return card
}

/**
 * iOS shows the keyboard only for a focus taken inside the tap, and the text's editor mounts a
 * moment later. A stand-in takes the focus within the tap and hands it to the editor when it focuses.
 */
function holdKeyboard(x: number, y: number): void {
  const stand = document.createElement('div')
  stand.contentEditable = 'true'
  stand.dataset.planFocusStandIn = ''
  stand.setAttribute('aria-hidden', 'true')
  Object.assign(stand.style, {
    position: 'fixed',
    left: `${Math.max(0, x)}px`,
    top: `${Math.max(0, y)}px`,
    width: '1px',
    height: '1px',
    opacity: '0',
    overflow: 'hidden',
    fontSize: '16px',
    pointerEvents: 'none',
  })
  document.body.append(stand)
  stand.focus({ preventScroll: true })
  const drop = () => {
    window.clearTimeout(timer)
    document.removeEventListener('focusin', handedOver, true)
    stand.remove()
  }
  const handedOver = (event: FocusEvent) => {
    if (event.target !== stand) drop()
  }
  const timer = window.setTimeout(drop, 2000)
  document.addEventListener('focusin', handedOver, true)
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

/** The blocks directly inside `container` (a phase's paragraphs, code, and cards). */
function innerBlocks(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-plan-block]')).filter(
    (child) => child.parentElement?.closest('[data-plan-block]') === container && !child.closest('[data-plan-block-editor]'),
  )
}

/**
 * Of `blocks`, the one level with `y`. The gap under a block is its own, so the pointer keeps it on the
 * way down; the last block's runs to `bottom` when given (the end of the phase that holds it).
 */
function levelWith(blocks: HTMLElement[], y: number, bottom?: number): HTMLElement | null {
  for (const [index, block] of blocks.entries()) {
    const rect = block.getBoundingClientRect()
    const end = blocks[index + 1]?.getBoundingClientRect().top ?? Math.max(rect.bottom, bottom ?? rect.bottom)
    if (y >= rect.top && y < end) return block
  }
  return null
}

/**
 * The card the Edit pill is for with the pointer on `target` at `y`: the innermost block under it. In a
 * block's own space beside the blocks it holds (a phase's rail and padding) that is the block level
 * with the pointer, so the pill stays on the block the pointer left on its way to the pill. Text has
 * no pill: a click opens it.
 */
export function pillTargetOf(target: EventTarget | null, y?: number): HTMLElement | null {
  let block = editTargetOf(target)
  if (!block) return null
  if (y !== undefined && !isTextBlock(block)) block = levelWith(innerBlocks(block), y) ?? block
  return isTextBlock(block) ? null : block
}

/** The block that holds `block` (a phase), or null for a top-level block. */
function holderOf(block: HTMLElement): HTMLElement | null {
  const root = article()
  const outer = block.parentElement?.closest<HTMLElement>('[data-plan-block]') ?? null
  return outer && root?.contains(outer) ? outer : null
}

/** A block a new one can go after: not inside a locked block, whose blocks stay as they are. */
function addsAfter(block: HTMLElement): boolean {
  return !block.parentElement?.closest('[data-edit-locked="true"]')
}

/** What stands at a level of the plan for the + bars: its blocks, and an open editor in the place of one. */
const LEVEL_ITEM = '[data-plan-block], [data-plan-block-editor]'

/** The blocks at the top level, or directly inside `container` (a phase), with any open editor among them, in reading order. */
function levelItems(container: HTMLElement | null): HTMLElement[] {
  const root = article()
  if (!root) return []
  const scope = container ?? root
  return Array.from(scope.querySelectorAll<HTMLElement>(LEVEL_ITEM)).filter(
    (item) => (item.parentElement?.closest('[data-plan-block]') ?? null) === container && !item.parentElement?.closest('[data-plan-block-editor]'),
  )
}

/** Where the + bars go with the pointer on `target` at `y`: under `block`, and under the phase that holds it. */
export type AddTargets = { block: HTMLElement; holder: HTMLElement | null }

/**
 * The blocks whose + bars show with the pointer on `target` at `y`: the block under it, text and
 * cards alike, and the phase that holds it. The gap under a block is its own, the gap after a phase's
 * last block included, so the pointer can go down to that block's bar. A phase's title row is the
 * phase's: its bar is under the whole phase.
 */
export function addTargetsOf(target: EventTarget | null, y: number): AddTargets | null {
  const root = article()
  if (!root || !(target instanceof Element) || !root.contains(target) || target.closest('[data-plan-block-editor]')) return null
  let block = editTargetOf(target)
  // The gap under an open editor is the editor's: no bar there, nor for the block above it (Enter makes the next line).
  if (!block && target === root) block = levelWith(levelItems(null), y, root.getBoundingClientRect().bottom)
  else if (block && !isTextBlock(block)) block = levelWith(levelItems(block), y, block.getBoundingClientRect().bottom) ?? block
  if (!block || block.hasAttribute('data-plan-block-editor')) return null
  const holder = holderOf(block)
  if (addsAfter(block)) return { block, holder: holder && addsAfter(holder) ? holder : null }
  return holder && addsAfter(holder) ? { block: holder, holder: null } : null
}

/** A block the plan marks `locked`, or one inside a locked block, or an answer card that keeps its default lock. */
export function isEditLocked(block: Element): boolean {
  return block.closest('[data-edit-locked="true"]') !== null || block.querySelector(':scope > [data-edit-locked="true"]') !== null
}

/** Controls inside text that keep their own click: links, buttons, checkboxes, fields. */
const OWN_CLICK =
  'a[href], button, input, select, textarea, label, summary, [contenteditable="true"], [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="menuitem"], [role="option"]'

/** What a click on `target` edits where it is: text, a card's title, a pipe table's cell, or a data table's cell. */
export type DirectEdit =
  | { kind: 'text'; element: HTMLElement }
  | { kind: 'title'; element: HTMLElement; block: HTMLElement; attr: string }
  | { kind: 'cell'; element: HTMLElement }
  | { kind: 'grid'; element: HTMLElement; block: HTMLElement; row: number; column: number }

/** The card a title belongs to: a plan entry, or the workflow. */
const TITLE_OWNER = '[data-entry], .vlp-workflow'

/**
 * A card's title under `target` (its text carries `data-plan-title`, the attribute it comes from),
 * when the card has its own place in the file: the card is that block, or the one thing inside it.
 * A card drawn inside another block without a place of its own is edited with that block.
 */
function titleEditOf(target: Element, root: HTMLElement): DirectEdit | null {
  const title = target.closest<HTMLElement>('[data-plan-title]')
  if (!title || !root.contains(title) || title.closest('[data-plan-block-editor]')) return null
  // The title's own link (a phase's, to the workflow) gives way to editing; a control inside a title keeps its click.
  const own = target.closest(OWN_CLICK)
  if (own && title.contains(own) && own !== title) return null
  const attr = title.dataset.planTitle
  const block = title.closest<HTMLElement>('[data-plan-block]')
  const owner = title.closest<HTMLElement>(TITLE_OWNER)
  if (!attr || !block || !owner || !root.contains(block)) return null
  if (owner !== block && owner.parentElement !== block && owner.parentElement?.parentElement !== block) return null
  if (isEditLocked(title) || isEditLocked(block) || !(title.textContent ?? '').trim()) return null
  return { kind: 'title', element: title, block, attr }
}

export function directEditOf(target: EventTarget | null): DirectEdit | null {
  if (!(target instanceof Element)) return null
  const root = article()
  if (!root || !root.contains(target) || target.closest('[data-plan-block-editor], [data-plan-title-editing]')) return null
  const title = titleEditOf(target, root)
  if (title) return title
  if (target.closest('[data-plan-title]') || target.closest(OWN_CLICK)) return null
  // Text a card draws inside itself (a callout's paragraph, a tab's list) has the place of its text.
  const text = target.closest<HTMLElement>('[data-plan-text]')
  if (text && root.contains(text)) return isEditLocked(text) ? null : { kind: 'text', element: text }
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

/**
 * True while a click picks a part to comment on. The comment toggle marks the page at once
 * (`html[data-comments]`, client/PlanSelector.tsx); the session's mode follows after the service
 * answers, and in review it stays `review`. This page hears clicks before the comment picker does.
 */
export function commenting(): boolean {
  return document.documentElement.dataset.comments === 'on' || document.body.dataset.planMode === 'comment'
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

// Drawn at 10px in the + bar, so its stroke is about a whole pixel there.
const PLUS =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>'

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

export function marginsOf(element: Element): { top: string; bottom: string } {
  return { top: `${collapsedMargin(element, 'top')}px`, bottom: `${collapsedMargin(element, 'bottom')}px` }
}

/** The space and the height of a new, empty paragraph right after `block`, measured where it will be. */
export function paragraphAfter(block: Element): { margins: { top: string; bottom: string }; height: number } {
  const probe = document.createElement('p')
  probe.textContent = '\u200b'
  probe.style.visibility = 'hidden'
  block.after(probe)
  const margins = marginsOf(probe)
  const height = probe.getBoundingClientRect().height
  probe.remove()
  return { margins, height }
}

/**
 * The space a card's editor keeps around it, so the blocks around it stay where they are while it is
 * open: the card's own top margin, and the gap down to the block after it. That block's own margin can
 * come from what precedes it (a heading after a card sits lower), which the editor in the card's place
 * does not give it, so the editor holds the whole gap itself.
 */
export function cardMargins(block: Element): { top: string; bottom: string } {
  const margins = marginsOf(block)
  const next = block.nextElementSibling
  if (next) {
    const gap = next.getBoundingClientRect().top - block.getBoundingClientRect().bottom
    if (gap >= 0) margins.bottom = `${gap}px`
  }
  return margins
}

/** How text keeps its place when it turns into its editor: its margins and its height. */
function textPlace(element: Element): Pick<EditHow, 'margins' | 'height'> {
  return { margins: marginsOf(element), height: element.getBoundingClientRect().height }
}

function rangeStart(value: string | undefined): number | null {
  const match = /^(\d+)-\d+$/.exec(value ?? '')
  return match ? Number(match[1]) : null
}

/** The place of a block in the plan file: a card's text has its own (`data-plan-text`), any other block its block's. */
function placeOf(element: HTMLElement): string | undefined {
  return element.dataset.planText ?? element.dataset.planBlock
}

/** The block that starts at `start` in the plan the page draws, text first (a fence's frame and its code share one place). */
function blockStartingAt(start: number): HTMLElement | null {
  const root = article()
  if (!root) return null
  const found = Array.from(root.querySelectorAll<HTMLElement>('[data-plan-block], [data-plan-text]')).filter(
    (element) => rangeStart(placeOf(element)) === start && !element.closest('[data-plan-block-editor]'),
  )
  return found.find(isTextBlock) ?? found[0] ?? null
}

/** The text block right after `block` at its level, skipping the plan header's eyebrow and facts. */
function textBlockAfter(block: HTMLElement): HTMLElement | null {
  const attribute = block.hasAttribute('data-plan-text') ? 'data-plan-text' : 'data-plan-block'
  for (let next = block.nextElementSibling; next; next = next.nextElementSibling) {
    if (!(next instanceof HTMLElement) || !next.hasAttribute(attribute)) continue
    return isTextBlock(next) && !isEditLocked(next) ? next : null
  }
  return null
}

/**
 * The editor that opens after Enter split a block's text (client/editor/BlockEditor.tsx), found on the
 * page as it now draws the plan: the next block with the caret at its start, or an empty block after
 * the edited one with a paragraph's spacing. Null when the page has no such block.
 */
export function followEdit(follow: EditFollow): ({ kind: 'edit' | 'add'; range: string } & EditHow) | null {
  const block = blockStartingAt(follow.start)
  const place = block ? placeOf(block) : undefined
  if (!block || !place) return null
  if (follow.open === 'add') return { kind: 'add', range: place, ...paragraphAfter(block) }
  if (follow.open === 'end' || follow.open === 'start') {
    if (!isTextBlock(block) || isEditLocked(block)) return null
    return { kind: 'edit', range: place, caret: { offset: follow.open === 'end' ? Number.MAX_SAFE_INTEGER : 0 }, ...textPlace(block) }
  }
  const next = textBlockAfter(block)
  const range = next ? placeOf(next) : undefined
  return next && range ? { kind: 'edit', range, caret: { offset: 0 }, ...textPlace(next) } : null
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

/** The room the last block leaves under it for its + bar. The bar's own size is client/addBar.ts. */
const BAR_ROOM = 24
/** Room between a phase's bar and the bar of its last block, just above it. */
const BAR_GAP = 6

/** A + bar: a slim gray bar with a +, in the gap under a block, as wide as the block. */
function addBar(label: string, title: string, text?: string): HTMLButtonElement {
  const bar = toolButton('plan-add-bar', label, title, text ? `${PLUS}<span class="plan-add-bar-label">${text}</span>` : PLUS)
  bar.dataset.planAddBar = ''
  return bar
}

type BarPlace = { top: number; left: number; width: number; height: number; tight: boolean; slim: boolean }

/**
 * Where `block`'s + bar goes: in the middle of the gap under it, before the next block at its level,
 * or the end of the phase that holds it. The plan's title draws its facts under it: the gap is under
 * those. The bar keeps clear of the blocks above and below it (client/addBar.ts): a narrow gap gets a
 * shorter bar, or a slim line with no +, and its click target stays inside the gap.
 */
function barPlace(block: HTMLElement): BarPlace {
  const rect = block.getBoundingClientRect()
  let bottom = rect.bottom
  let next: Element | null = block.nextElementSibling
  while (next instanceof HTMLElement && next.matches('[data-plan-head]')) {
    bottom = next.getBoundingClientRect().bottom
    next = next.nextElementSibling
  }
  const holder = block.parentElement?.closest('[data-plan-block]')
  const end = next ? next.getBoundingClientRect().top : holder ? holder.getBoundingClientRect().bottom - (Number.parseFloat(getComputedStyle(holder).borderBottomWidth) || 0) : bottom + BAR_ROOM
  const fit = barFit(end - bottom)
  return {
    top: bottom + fit.offset + window.scrollY,
    left: rect.left + window.scrollX,
    width: rect.width,
    height: fit.height,
    tight: fit.tight,
    slim: fit.slim,
  }
}

/** True when `block` is the plan's last top-level block: Add a block, right under it, adds after it. */
function lastOfPlan(block: HTMLElement): boolean {
  const root = article()
  if (!root || block.parentElement !== root || !document.querySelector('[data-plan-add-block]:not([data-editing])')) return false
  for (let next = block.nextElementSibling; next; next = next.nextElementSibling) if (next.matches('[data-plan-block], [data-plan-block-editor]')) return false
  return true
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
  tools.append(edit)
  // + under the block under the pointer, and under the phase that holds it, which says so. They stay
  // out of the tab order: A adds a block below the block with focus, as E edits it.
  const add = addBar('Add a block below', `Add a block below (${BLOCK_ADD_KEY})`)
  add.dataset.planBlockAdd = ''
  add.setAttribute('aria-keyshortcuts', BLOCK_ADD_KEY)
  const addAfterHolder = addBar('Add a block below the phase', 'Add a block below the phase', 'After phase')
  addAfterHolder.dataset.planHolderAdd = ''
  document.body.append(tools, add, addAfterHolder)
  let block: HTMLElement | null = null
  // The innermost block under the pointer, with focus, or tapped, text included: what E edits.
  let pointed: HTMLElement | null = null
  // Text inside a card under the pointer: E edits it before the card.
  let pointedText: HTMLElement | null = null
  let frame = 0
  let hideTimer = 0
  // The blocks the + bars are under.
  let bars: AddTargets | null = null
  let barTimer = 0
  // After a + the bars stay away until the pointer moves: the new line opens right where they were.
  let barsRest = false

  const inTools = (target: EventTarget | null) =>
    target instanceof Node && (tools.contains(target) || add.contains(target) || addAfterHolder.contains(target))

  const hide = () => {
    window.clearTimeout(hideTimer)
    block = null
    tools.removeAttribute('data-visible')
  }
  const hideBars = () => {
    window.clearTimeout(barTimer)
    bars = null
    add.removeAttribute('data-visible')
    addAfterHolder.removeAttribute('data-visible')
  }
  const placeBars = () => {
    if (!bars || !bars.block.isConnected) return hideBars()
    const rect = bars.block.getBoundingClientRect()
    if (rect.bottom < -BAR_ROOM || rect.top > window.innerHeight) return hideBars()
    // The plan's last block has Add a block right under it, which adds after it.
    const below = lastOfPlan(bars.block) ? null : barPlace(bars.block)
    const holder = bars.holder?.isConnected && !lastOfPlan(bars.holder) ? barPlace(bars.holder) : null
    // The phase's bar keeps clear of its last block's, which sits just above it.
    if (holder && below) holder.top = Math.max(holder.top, below.top + below.height + BAR_GAP)
    for (const [bar, at] of [
      [add, below],
      [addAfterHolder, holder],
    ] as const) {
      if (!at) {
        bar.removeAttribute('data-visible')
        continue
      }
      bar.style.top = `${at.top}px`
      bar.style.left = `${at.left}px`
      bar.style.width = `${at.width}px`
      bar.style.height = `${at.height}px`
      // In a narrow gap the bar takes no clicks past its own edges, and a bar too short for its + is a line.
      bar.toggleAttribute('data-tight', at.tight)
      bar.toggleAttribute('data-slim', at.slim)
      bar.setAttribute('data-visible', '')
    }
  }
  const showBars = (next: AddTargets) => {
    window.clearTimeout(barTimer)
    if (bars?.block === next.block && bars.holder === next.holder && add.hasAttribute('data-visible')) return
    bars = next
    placeBars()
  }
  const place = () => {
    if (!block || !block.isConnected) return hide()
    const rect = block.getBoundingClientRect()
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      // The card whose text is open keeps its pill while it is out of view, and the pill comes back
      // with the card. The page can jump away and back as the text's editor draws.
      if (block === pinned) return void tools.removeAttribute('data-visible')
      return hide()
    }
    const width = tools.offsetWidth || 64
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
    if (block === pinned) tools.setAttribute('data-visible', '')
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
    return state.editable && !state.editing && !commenting()
  }
  // The + bars stay while a block is edited: a press on one keeps that edit first, then adds.
  const barsUsable = () => options.state().editable && !commenting()
  // The card whose text or title is open: its pill stays beside it while the text is edited.
  let pinned: HTMLElement | null = null
  let pinFrame = 0
  const refresh = (frames = 12) => {
    cancelAnimationFrame(pinFrame)
    const state = options.state()
    if (!state.editable || commenting()) hideBars()
    else if (bars) placeBars()
    if (!state.editable || !state.editing || commenting()) {
      if (pinned) {
        pinned = null
        hide()
      }
      return
    }
    const card = cardOfOpenText()
    if (card) {
      pinned = card
      if (card !== block || !tools.hasAttribute('data-visible')) show(card)
      return
    }
    if (pinned) {
      pinned = null
      hide()
    }
    // The text's editor can take a frame or two to appear.
    if (frames > 0) pinFrame = requestAnimationFrame(() => refresh(frames - 1))
  }
  const trackBars = (target: EventTarget | null, y: number | undefined) => {
    const next = barsUsable() && !barsRest && y !== undefined ? addTargetsOf(target, y) : null
    if (next) {
      showBars(next)
      return
    }
    if (!bars) return
    window.clearTimeout(barTimer)
    barTimer = window.setTimeout(hideBars, HIDE_DELAY_MS)
  }
  const track = (target: EventTarget | null, y?: number) => {
    if (inTools(target)) {
      window.clearTimeout(hideTimer)
      window.clearTimeout(barTimer)
      return
    }
    trackBars(target, y)
    // While a card's text is edited, its pill stays with it.
    if (pinned && options.state().editing) return
    const inner = usable() ? editTargetOf(target) : null
    pointed = inner && !isEditLocked(inner) ? inner : null
    const text = inner && target instanceof Element ? target.closest<HTMLElement>('[data-plan-text]') : null
    pointedText = text && inner?.contains(text) && !isEditLocked(text) ? text : null
    const next = inner ? pillTargetOf(target, y) : null
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
    if (isTouchPointer(event)) return
    const { target, clientY } = event
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => track(target, clientY))
  }
  // A touch screen has no hover: a tap on a block shows its pill and its + bars.
  const onTap = (event: PointerEvent) => {
    if (!isTouchPointer(event)) return
    barsRest = false
    track(event.target, event.clientY)
  }
  const onMove = () => {
    if (block) place()
    if (bars) placeBars()
  }
  // The pointer moved for real (the browser also reports pointers over what moved under them): the bars come back.
  const onPointerMove = (event: PointerEvent) => {
    if (!barsRest || isTouchPointer(event) || (event.movementX === 0 && event.movementY === 0)) return
    barsRest = false
    cancelAnimationFrame(frame)
    const { target, clientY } = event
    frame = requestAnimationFrame(() => track(target, clientY))
  }
  /** How a new block after `after` opens: an empty line, edited as text reads, with a paragraph's spacing. */
  const addHow = (after: HTMLElement): EditHow => ({ inline: true, ...paragraphAfter(after) })
  // Edit or + pressed while an edit was open: that edit is kept first, then this runs.
  let pending: { action: 'edit' | 'add'; block: HTMLElement; at: number } | null = null
  const run = (action: 'edit' | 'add', target: HTMLElement | null) => {
    if (target && options.state().editing) {
      pending = { action, block: target, at: Date.now() }
      pinned = null
      hide()
      hideBars()
      if (action === 'add') barsRest = true
      options.finish()
      return
    }
    hide()
    hideBars()
    if (action === 'add') barsRest = true
    const range = target?.dataset.planBlock
    if (!target || !range || !barsUsable()) return
    if (action === 'edit') {
      if (usable()) options.edit(range, { margins: cardMargins(target) })
    } else options.add(range, addHow(target))
  }
  const onEdit = () => run('edit', block)
  // A tap that opens a new line gives the keyboard a stand-in at once, as a tap on text does (iOS).
  const onAdd = (under: () => HTMLElement | null | undefined) => (event: MouseEvent) => {
    const target = under() ?? null
    if (isTap(event) && target) holdKeyboard(event.clientX, event.clientY)
    run('add', target)
  }
  const onAddBelow = onAdd(() => bars?.block)
  const onAddAfterHolder = onAdd(() => bars?.holder)
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      hide()
      hideBars()
      return
    }
    const key = event.key.toUpperCase()
    if (key !== BLOCK_EDIT_KEY && key !== BLOCK_ADD_KEY) return
    if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return
    const target = event.target
    if (target instanceof HTMLElement && (target.closest('input, textarea, select') || target.isContentEditable)) return
    if (!usable()) return
    event.preventDefault()
    if (key === BLOCK_ADD_KEY) {
      // A new line below the block under the pointer, or with focus, or at the reading line.
      if (showPlanTab()) return
      const focused = editTargetOf(document.activeElement)
      const after = [bars?.block, focused, blockAtReadingLine()]
        .map((candidate) => (candidate?.isConnected ? (addsAfter(candidate) ? candidate : holderOf(candidate)) : null))
        .find((candidate): candidate is HTMLElement => Boolean(candidate?.dataset.planBlock))
      hide()
      hideBars()
      if (!after?.dataset.planBlock) return
      barsRest = true
      options.add(after.dataset.planBlock, addHow(after))
      return
    }
    // From Workflow or Settings, E shows the plan first.
    if (showPlanTab()) return
    if (pointedText?.isConnected && pointedText.dataset.planText) {
      const range = pointedText.dataset.planText
      const place = textPlace(pointedText)
      hide()
      options.edit(range, { inline: true, ...place })
      return
    }
    const hovered = pointed?.isConnected ? pointed : null
    const focused = editTargetOf(document.activeElement)
    const next = [hovered, focused && !isEditLocked(focused) ? focused : null, blockAtReadingLine()].find(
      (candidate): candidate is HTMLElement => Boolean(candidate?.dataset.planBlock),
    )
    hide()
    if (!next?.dataset.planBlock) return
    options.edit(next.dataset.planBlock, isTextBlock(next) ? { inline: true, ...textPlace(next) } : { margins: cardMargins(next) })
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
    if (direct.kind === 'title') {
      const range = direct.block.dataset.planBlock
      if (range) options.title(direct.element, range, direct.attr, caret)
      return
    }
    // Text in a card has the place of its text; other text is a block of its own.
    const range = direct.kind === 'grid' ? direct.block.dataset.planBlock : (direct.element.dataset.planText ?? direct.element.dataset.planBlock)
    if (!range) return
    if (direct.kind === 'grid') options.edit(range, { caret, margins: cardMargins(direct.block) })
    else options.edit(range, { inline: true, caret, ...textPlace(direct.element) })
  }
  const plainPress = (event: MouseEvent) =>
    event.button === 0 && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
  // A press on another block while an editor is open finishes that editor (client/editor/BlockEditor.tsx);
  // once the page shows the edit, the focus goes where the press went: that text opens with the caret
  // there, or that card shows its pill. A mouse is taken at the press, since the page can move before
  // the release; a finger at the tap, since a press may start a scroll.
  let queued:
    | { direct: DirectEdit; caret: EditCaret | undefined; text: string; at: number }
    | { pill: HTMLElement; at: number }
    | null = null
  const queue = (event: MouseEvent): boolean => {
    const state = options.state()
    if (!state.editable || !state.editing || commenting()) return false
    if (inTools(event.target)) return true
    const direct = directEditOf(event.target)
    const pill = direct ? null : pillTargetOf(event.target, event.clientY)
    if (direct) queued = { direct, caret: caretFor(direct, event.clientX, event.clientY), text: direct.element.textContent ?? '', at: Date.now() }
    else if (pill && !isEditLocked(pill)) queued = { pill, at: Date.now() }
    return true
  }
  const onPress = (event: PointerEvent) => {
    if (isTouchPointer(event)) return
    queued = null
    if (plainPress(event)) queue(event)
  }
  // The page hears a click first, on the window as it goes down: a card that keeps clicks to itself
  // (a choice, an approval) still has text and a title to edit. The handlers on the way run before
  // the text opens, so a control that takes the click (it prevents the default) keeps it.
  const onClick = (event: MouseEvent) => {
    if (!plainPress(event) || event.defaultPrevented) return
    const state = options.state()
    const direct = state.editable && !commenting() ? directEditOf(event.target) : null
    // A title's click is its own while the plan can be edited: the link it sits in (a phase's, to the
    // workflow) does not follow, even when the click finishes another edit first.
    if (direct?.kind === 'title') event.preventDefault()
    const tap = isTap(event)
    if (tap && queue(event)) return
    if (!usable() || !direct || selecting()) return
    const caret = caretFor(direct, event.clientX, event.clientY)
    // A title opens within the click, so a touch screen shows its keyboard.
    if (direct.kind === 'title') {
      openDirect(direct, caret)
      return
    }
    // Text opens a moment after the tap: a stand-in holds the keyboard on iOS until its editor focuses.
    if (tap && direct.kind !== 'grid') holdKeyboard(event.clientX, event.clientY)
    window.setTimeout(() => {
      if (event.defaultPrevented || !usable() || selecting()) return
      openDirect(direct, caret)
    }, 0)
  }
  const closed = () => {
    const action = pending
    pending = null
    if (action && Date.now() - action.at <= QUEUE_MS && barsUsable() && action.block.isConnected) {
      // The block keeps its element when the edit before it is drawn; its place is the one the page shows now.
      queued = null
      const range = action.block.dataset.planBlock
      if (!range) return
      if (action.action === 'edit') {
        if (usable()) options.edit(range, { margins: cardMargins(action.block) })
      } else options.add(range, addHow(action.block))
      return
    }
    const next = queued
    queued = null
    if (!next || Date.now() - next.at > QUEUE_MS || !usable() || selecting()) return
    if ('pill' in next) {
      if (next.pill.isConnected) show(next.pill)
      return
    }
    // The text pressed on is still there, unless the edit changed it.
    if (!next.direct.element.isConnected || (next.direct.element.textContent ?? '') !== next.text) return
    openDirect(next.direct, next.caret)
  }
  // Focus moving into a block (a folder, a tab, a link) shows its pill too, and E edits it.
  const onFocus = (event: FocusEvent) => {
    if (inTools(event.target)) return
    if (event.target instanceof HTMLElement && event.target.dataset.planFocusStandIn !== undefined) return
    track(event.target)
  }
  // The bars take no focus from the open editor: a press on one keeps the edit, then adds.
  const keepFocus = (event: MouseEvent) => event.preventDefault()
  edit.addEventListener('click', onEdit)
  add.addEventListener('click', onAddBelow)
  addAfterHolder.addEventListener('click', onAddAfterHolder)
  add.addEventListener('mousedown', keepFocus)
  addAfterHolder.addEventListener('mousedown', keepFocus)
  window.addEventListener('click', onClick, true)
  document.addEventListener('pointerdown', onPress, { passive: true })
  document.addEventListener('pointerover', onPointer, { passive: true })
  document.addEventListener('pointermove', onPointerMove, { passive: true })
  // Heard on the window as it goes down, so a component that keeps its pointer events still shows its pill.
  window.addEventListener('pointerup', onTap, { capture: true, passive: true })
  document.addEventListener('focusin', onFocus)
  document.addEventListener('keydown', onKey)
  window.addEventListener('scroll', onMove, { passive: true })
  window.addEventListener('resize', onMove)
  const stop = () => {
    cancelAnimationFrame(frame)
    cancelAnimationFrame(pinFrame)
    window.clearTimeout(hideTimer)
    window.clearTimeout(barTimer)
    queued = null
    pending = null
    edit.removeEventListener('click', onEdit)
    add.removeEventListener('click', onAddBelow)
    addAfterHolder.removeEventListener('click', onAddAfterHolder)
    add.removeEventListener('mousedown', keepFocus)
    addAfterHolder.removeEventListener('mousedown', keepFocus)
    window.removeEventListener('click', onClick, true)
    document.removeEventListener('pointerdown', onPress)
    document.removeEventListener('pointerover', onPointer)
    document.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onTap, { capture: true })
    document.removeEventListener('focusin', onFocus)
    document.removeEventListener('keydown', onKey)
    window.removeEventListener('scroll', onMove)
    window.removeEventListener('resize', onMove)
    tools.remove()
    add.remove()
    addAfterHolder.remove()
  }
  return { stop, closed, refresh: () => refresh() }
}
