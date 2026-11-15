/* ----------------------------------------------------------------------------------------------
 * Move a block where it reads (ADR 0040). While the plan can be edited, a grip sits left of the
 * block under the pointer, with focus, or tapped: text, cards, choices, endpoints, diagrams, code,
 * tables, phases, and the blocks inside a phase. Dragging it puts the block before or after another
 * one, at the top level or inside a phase; a click or a tap opens Move up and Move down, and
 * Alt+Up or Alt+Down moves the block with focus. The parts of a component (a file tree's rows, a
 * choice's options, a diagram's nodes) are not blocks of the plan, so they keep their order. So do
 * the blocks inside a locked block; the locked block itself moves, as a locked card does in the editor.
 *
 * The grip stays while a block is edited, beside the editor too, which stands in for its block
 * (`data-plan-edit-block`). A press on the grip finishes the edit first, as a click outside does; the
 * move waits for the page to draw that edit and finds its blocks again in the file the page shows.
 * ------------------------------------------------------------------------------------------- */

import { remapBlockStart, type BlockPlace } from '../src/planMdx/remarkBlockRanges.ts'
import { editTargetOf, isEditLocked } from './planEditButton.ts'
import { isTouchPointer } from './pointerKind.ts'

type MoveState = { editable: boolean; editing: boolean }

/** A move the page made: the moved block's new `data-plan-block`, and the plan file it is a place in. */
export type BlockMoved = { range: string; source: string }

export type BlockMoveActions = {
  state: () => MoveState
  /** Put the block at `range` before or after the block at `target`. Null when it stayed where it was. */
  move: (range: string, target: string, place: BlockPlace) => Promise<BlockMoved | null>
  /** Finish the open editor or title, keeping what was typed, so a move starts from the plan with that edit. */
  finishEditing: () => void
  /** Take the block at `range` out of the plan, as one more unapplied change. False when it stayed. */
  remove: (range: string) => Promise<boolean>
}

export type BlockMoveBinding = {
  stop: () => void
  /** The page drew `source`. A move waits for it before the grip follows the block and the next move can start. */
  rendered: (source: string) => void
  /** The plan stopped being editable, or an editor opened: the grip goes. */
  refresh: () => void
}

function article(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-plan-rendered]')
}

/** A block's place in the plan file: its own, or that of the block an open editor stands in for. */
export function placeOf(block: Element): string | undefined {
  return block instanceof HTMLElement ? (block.dataset.planBlock ?? block.dataset.planEditBlock) : undefined
}

/** Blocks that move, and an open editor in place of its block. */
const BLOCKS = '[data-plan-block], [data-plan-block-editor][data-plan-edit-block]'

/** The block that holds `block` (a phase), or null for a top-level block. */
export function containerOf(block: Element): HTMLElement | null {
  const root = article()
  const outer = block.parentElement?.closest<HTMLElement>('[data-plan-block]') ?? null
  return outer && root?.contains(outer) ? outer : null
}

/** The blocks directly inside `container`, or the top-level blocks when it is null, in reading order. */
export function blocksIn(container: HTMLElement | null): HTMLElement[] {
  const root = article()
  if (!root) return []
  return Array.from((container ?? root).querySelectorAll<HTMLElement>(BLOCKS)).filter(
    (block) => containerOf(block) === container && !block.parentElement?.closest('[data-plan-block-editor]'),
  )
}

/** A block that moves: it has a place in the file and is not inside a locked block, whose blocks keep their order. */
export function isMovable(block: Element): block is HTMLElement {
  return block instanceof HTMLElement && Boolean(placeOf(block)) && !block.parentElement?.closest('[data-edit-locked="true"]')
}

function movableFrom(block: HTMLElement | null): HTMLElement | null {
  let next = block
  while (next && !isMovable(next)) next = containerOf(next)
  return next
}

/** Of `blocks`, the one level with `y`. The gap under a block is its own, so the pointer keeps it on the way down. */
function blockLevelWith(blocks: HTMLElement[], y: number): HTMLElement | null {
  for (const [index, block] of blocks.entries()) {
    const rect = block.getBoundingClientRect()
    const end = blocks[index + 1]?.getBoundingClientRect().top ?? rect.bottom
    if (y >= rect.top && y < end) return block
  }
  return null
}

/**
 * The block the grip is for with the pointer on `target` at `y`: the innermost block there, or
 * the block inside it that is level with the pointer. A phase's rail and the gutter left of its
 * blocks belong to the block beside them, so the pointer can go left to that block's grip.
 */
export function moveTargetOf(target: EventTarget | null, y: number): HTMLElement | null {
  const root = article()
  if (!root || !(target instanceof Element) || !root.contains(target)) return null
  // An open editor moves as the block it stands in for.
  const editor = target.closest<HTMLElement>('[data-plan-block-editor]')
  if (editor) return editor.hasAttribute('data-plan-edit-block') && isMovable(editor) ? editor : null
  const block = editTargetOf(target)
  return movableFrom(blockLevelWith(blocksIn(block), y) ?? block)
}

/** A place a dragged block can go: before a block, or after the last block of a level. */
export type MoveSlot = {
  target: HTMLElement
  place: BlockPlace
  /** The phase the block would go into, or null for the top level. */
  container: HTMLElement | null
  /** Its place among the blocks of that level, without the dragged one. */
  index: number
  y: number
  left: number
  width: number
}

/** Room between a line and the block it is drawn above or below, when no block is on the other side. */
const LINE_GAP = 6

/**
 * Every place `dragged` can go: between the top-level blocks, and between the blocks of each phase
 * that is not locked. A block that holds blocks (a phase) goes only between top-level blocks.
 */
export function moveSlotsFor(dragged: HTMLElement): MoveSlot[] {
  const top = blocksIn(null)
  const holdsBlocks = dragged.querySelector('[data-plan-block]') !== null
  const levels: Array<HTMLElement | null> = [null]
  if (!holdsBlocks) {
    for (const block of top) if (block !== dragged && !isEditLocked(block) && blocksIn(block).length > 0) levels.push(block)
  }
  const slots: MoveSlot[] = []
  for (const container of levels) {
    const list = (container ? blocksIn(container) : top).filter((block) => block !== dragged)
    if (list.length === 0) continue
    const rects = list.map((block) => block.getBoundingClientRect())
    const left = Math.min(...rects.map((rect) => rect.left))
    const width = Math.max(...rects.map((rect) => rect.right)) - left
    rects.forEach((rect, index) => {
      const y = index === 0 ? rect.top - LINE_GAP : (rects[index - 1]!.bottom + rect.top) / 2
      slots.push({ target: list[index]!, place: 'before', container, index, y, left, width })
    })
    slots.push({
      target: list[list.length - 1]!,
      place: 'after',
      container,
      index: list.length,
      y: rects[rects.length - 1]!.bottom + LINE_GAP,
      left,
      width,
    })
  }
  return slots
}

/** True when `slot` is where `block` already is. */
export function isSameSlot(block: HTMLElement, slot: MoveSlot): boolean {
  const container = containerOf(block)
  return slot.container === container && slot.index === blocksIn(container).indexOf(block)
}

const GRIP =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>'

const ARROW_UP =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>'

const TRASH =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>'

const ARROW_DOWN =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>'

/** The grip's width and its room from the block. Match .plan-block-move in client/entries/primitives.css. */
const GRIP_WIDTH = 16
const GRIP_GAP = 2

/** How long the grip waits after the pointer leaves a block, so it can be reached. Matches the Edit pill. */
const HIDE_DELAY_MS = 300

/** How far the pointer goes on the grip before a press is a drag rather than a click. */
const DRAG_THRESHOLD = 5

/** Near the top or bottom of the window a drag scrolls the page, so a block can travel far. */
const SCROLL_EDGE = 56
const SCROLL_STEP = 14

/** How long a move waits for the page to draw it before the grip takes moves again. */
const RENDER_WAIT_MS = 4000

/** A block's place in the plan file, and the file the page drew when it was read. */
type Place = { range: string; source: string | null }

function menuItem(step: 'up' | 'down' | 'delete', label: string, icon: string): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.setAttribute('role', 'menuitem')
  if (step === 'delete') button.dataset.planBlockMoveDelete = ''
  else button.dataset.planBlockMoveStep = step
  button.innerHTML = `${icon}<span>${label}</span>`
  return button
}

const DELETE_LABEL = 'Delete'
const DELETE_ASK = 'Delete this block?'

export function bindBlockMove(options: BlockMoveActions): BlockMoveBinding {
  const grip = document.createElement('button')
  grip.type = 'button'
  grip.className = 'plan-block-move'
  grip.dataset.planBlockMove = ''
  // The keyboard's way in is Alt+Up and Alt+Down on the block with focus.
  grip.tabIndex = -1
  grip.setAttribute('aria-label', 'Move this block')
  grip.title = 'Drag to move · click for Move up and Move down'
  grip.setAttribute('aria-haspopup', 'menu')
  grip.setAttribute('aria-expanded', 'false')
  grip.setAttribute('aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown')
  grip.innerHTML = GRIP
  const menu = document.createElement('div')
  menu.className = 'plan-block-move-menu'
  menu.dataset.planBlockMoveMenu = ''
  menu.setAttribute('role', 'menu')
  menu.setAttribute('aria-label', 'Move block')
  menu.hidden = true
  const up = menuItem('up', 'Move up', ARROW_UP)
  const down = menuItem('down', 'Move down', ARROW_DOWN)
  // Delete asks once: the first press turns it into "Delete this block?".
  const remove = menuItem('delete', DELETE_LABEL, TRASH)
  const removeText = remove.querySelector('span')!
  menu.append(up, down, remove)
  const line = document.createElement('div')
  line.className = 'plan-block-move-line'
  line.dataset.planBlockMoveLine = ''
  line.setAttribute('aria-hidden', 'true')
  line.hidden = true
  document.body.append(grip, menu, line)

  let block: HTMLElement | null = null
  let menuOpen = false
  let frame = 0
  let scrollFrame = 0
  let hideTimer = 0
  let clickAfterDrag = false
  // The plan file the page drew last.
  let drawn: string | null = null
  // A move on its way to the page. The blocks on screen still carry the old places until it draws the new file.
  let pending: { source: string | null; menu: boolean; focus: boolean; range: string | null; timer: number } | null = null
  let drag: {
    block: HTMLElement
    /** Where the dragged block was when the drag started, to find it again once an edit it finished is drawn. */
    from: Place | null
    pointerId: number
    startY: number
    y: number
    moved: boolean
    slot: MoveSlot | null
  } | null = null
  // Where the block under the grip is, in the file the page drew when the grip went to it.
  let anchor: Place | null = null
  // Moves waiting for an edit the grip finished to be drawn.
  let idleWaiters: Array<() => void> = []

  const inTools = (target: EventTarget | null) => target instanceof Node && (grip.contains(target) || menu.contains(target))
  // The grip stays while a block is edited: pressing it finishes that edit first.
  const usable = () => {
    const state = options.state()
    return state.editable && document.body.dataset.planMode !== 'comment' && pending === null
  }
  const placeHere = (element: HTMLElement): Place | null => {
    const range = placeOf(element)
    return range ? { range, source: drawn } : null
  }
  /** The block at `place` on the page as it is drawn now: where it was, moved along with the edit drawn since. */
  const blockAt = (place: Place | null): HTMLElement | null => {
    const start = place ? Number(/^(\d+)-/.exec(place.range)?.[1]) : Number.NaN
    if (!place || !Number.isFinite(start)) return null
    const now = place.source !== null && drawn !== null ? remapBlockStart(place.source, drawn, start) : start
    if (now === null) return null
    return (
      Array.from(article()?.querySelectorAll<HTMLElement>(BLOCKS) ?? []).find(
        (block) => Number(/^(\d+)-/.exec(placeOf(block) ?? '')?.[1]) === now && !block.parentElement?.closest('[data-plan-block-editor]'),
      ) ?? null
    )
  }
  /** Resolves once no editor is open and the page drew what it kept: false when that takes too long. */
  const whenIdle = () =>
    new Promise<boolean>((resolve) => {
      if (!options.state().editing) {
        resolve(true)
        return
      }
      const done = () => {
        window.clearTimeout(timer)
        resolve(true)
      }
      const timer = window.setTimeout(() => {
        idleWaiters = idleWaiters.filter((waiter) => waiter !== done)
        resolve(false)
      }, RENDER_WAIT_MS)
      idleWaiters.push(done)
    })
  const wake = () => {
    if (options.state().editing || idleWaiters.length === 0) return
    const waiting = idleWaiters
    idleWaiters = []
    for (const waiter of waiting) waiter()
  }
  const resetDelete = () => {
    delete remove.dataset.confirm
    removeText.textContent = DELETE_LABEL
  }
  const closeMenu = () => {
    menuOpen = false
    menu.hidden = true
    grip.setAttribute('aria-expanded', 'false')
    resetDelete()
  }
  const hide = () => {
    window.clearTimeout(hideTimer)
    closeMenu()
    block = null
    grip.removeAttribute('data-visible')
  }
  const placeMenu = () => {
    const top = Number.parseFloat(grip.style.top) || 0
    const left = Number.parseFloat(grip.style.left) || 0
    const width = menu.offsetWidth || 160
    menu.style.top = `${top + (grip.offsetHeight || 24) + 4}px`
    menu.style.left = `${Math.max(window.scrollX + 8, Math.min(left, window.scrollX + window.innerWidth - width - 8))}px`
  }
  /**
   * The block under the grip, found again when the page drew it anew: an editor it stood beside
   * closed, kept or not. False when the block is gone.
   */
  const relink = (): boolean => {
    if (!block) return false
    if (block.isConnected) return true
    const found = blockAt(anchor)
    if (!found || !isMovable(found)) return false
    block = found
    anchor = placeHere(found)
    return true
  }
  const place = () => {
    if (!block || !relink()) return hide()
    const rect = block.getBoundingClientRect()
    if (!drag && (rect.bottom < 0 || rect.top > window.innerHeight)) return hide()
    const width = grip.offsetWidth || GRIP_WIDTH
    const height = grip.offsetHeight || 24
    const style = getComputedStyle(block)
    const padTop = (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.borderTopWidth) || 0)
    // Level with the block's first line: a phase's padding puts its title below the hairline.
    const lineHeight = Number.parseFloat(style.lineHeight)
    const centre = Number.isFinite(lineHeight) ? Math.max(0, (lineHeight - height) / 2) : 0
    const titleBar = document.querySelector('header.titlebar')?.getBoundingClientRect().bottom ?? 0
    // In the gutter left of the block when there is room, over its top-left corner when there is not.
    // The docked contents list ends 20px left of the plan column, so the grip keeps 2px from each.
    const roomLeft = rect.left >= width + 2 * GRIP_GAP
    const left = roomLeft ? rect.left - width - GRIP_GAP : Math.max(4, rect.left)
    const firstLine = roomLeft ? rect.top + padTop + centre : rect.top + padTop - height - 2
    // Never under the toolbar: a block whose top has scrolled away keeps the grip below the bar.
    const top = Math.min(Math.max(firstLine, titleBar + 8), rect.bottom - height)
    grip.style.top = `${top + window.scrollY}px`
    grip.style.left = `${left + window.scrollX}px`
    if (menuOpen) placeMenu()
  }
  const show = (next: HTMLElement) => {
    window.clearTimeout(hideTimer)
    if (next !== block) closeMenu()
    block = next
    anchor = placeHere(next)
    grip.setAttribute('data-visible', '')
    place()
  }
  const openMenu = (focus: boolean) => {
    if (!block) return
    const siblings = blocksIn(containerOf(block))
    const index = siblings.indexOf(block)
    up.disabled = index <= 0
    down.disabled = index < 0 || index >= siblings.length - 1
    // A locked block, or one that holds a locked block, moves but stays in the plan.
    remove.disabled = isEditLocked(block) || block.querySelector('[data-edit-locked="true"]') !== null
    remove.title = remove.disabled ? 'A locked block stays in the plan' : ''
    resetDelete()
    menuOpen = true
    menu.hidden = false
    grip.setAttribute('aria-expanded', 'true')
    placeMenu()
    if (!focus) return
    const first = [up, down].find((item) => !item.disabled)
    first?.focus({ preventScroll: true })
  }

  const track = (target: EventTarget | null, y: number) => {
    // An open menu stays on its block until a press outside it, Escape, or a choice.
    if (drag || menuOpen) return
    if (inTools(target)) {
      window.clearTimeout(hideTimer)
      return
    }
    const next = usable() ? moveTargetOf(target, y) : null
    if (next) {
      window.clearTimeout(hideTimer)
      if (next !== block || !grip.hasAttribute('data-visible')) show(next)
      return
    }
    if (!block || menuOpen) return
    window.clearTimeout(hideTimer)
    hideTimer = window.setTimeout(hide, HIDE_DELAY_MS)
  }
  const onPointer = (event: PointerEvent) => {
    if (isTouchPointer(event)) return
    const { target, clientY } = event
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => track(target, clientY))
  }
  // A touch screen has no hover: a tap on a block shows its grip.
  const onTap = (event: PointerEvent) => {
    if (!isTouchPointer(event) || inTools(event.target)) return
    track(event.target, event.clientY)
  }
  const onFocus = (event: FocusEvent) => {
    if (inTools(event.target) || !(event.target instanceof Element)) return
    const next = usable() ? movableFrom(editTargetOf(event.target)) : null
    if (next) show(next)
  }
  const onScroll = () => {
    if (block) place()
  }

  const finish = () => {
    const done = pending
    pending = null
    if (done) window.clearTimeout(done.timer)
    return done
  }
  const commit = async (from: Place | null, toward: Place | null, where: BlockPlace, after: { menu: boolean; focus: boolean }) => {
    // An edit the grip finished is drawn first; the blocks are then found again where it left them.
    if (!(await whenIdle())) return
    const moving = blockAt(from)
    const target = blockAt(toward)
    const range = moving?.dataset.planBlock
    const to = target?.dataset.planBlock
    if (!moving || !target || !range || !to || !usable()) return
    // A block that holds blocks (a phase) goes only between the top-level blocks.
    if (moving.querySelector('[data-plan-block]') && containerOf(target)) return
    hide()
    pending = { source: null, range: null, ...after, timer: window.setTimeout(finish, RENDER_WAIT_MS) }
    let moved: BlockMoved | null = null
    try {
      moved = await options.move(range, to, where)
    } catch {
      moved = null
    }
    if (!moved || !pending) {
      finish()
      return
    }
    pending.source = moved.source
    pending.range = moved.range
    // The page can draw the move before it is reported.
    if (drawn === moved.source) rendered(moved.source)
  }
  const step = async (moving: HTMLElement | null, direction: -1 | 1, after: { menu: boolean; focus: boolean }) => {
    if (!moving) return
    const from = moving.isConnected ? placeHere(moving) : anchor
    if (options.state().editing) {
      options.finishEditing()
      if (!(await whenIdle())) return
    }
    const current = blockAt(from)
    if (!current) return
    const siblings = blocksIn(containerOf(current))
    const neighbour = siblings[siblings.indexOf(current) + direction]
    if (!neighbour) return
    void commit(placeHere(current), placeHere(neighbour), direction < 0 ? 'before' : 'after', after)
  }
  function rendered(source: string) {
    const before = drawn
    drawn = source
    // An edit the grip finished is drawn: the grip and a drag follow their block to the element that draws it now.
    if (anchor && anchor.source === null) anchor = { range: anchor.range, source: before }
    follow()
    if (before !== source) {
      if (drag && !drag.block.isConnected) {
        const found = blockAt(drag.from)
        if (found) {
          drag.block = found
          if (drag.moved) found.setAttribute('data-plan-moving', '')
        }
      }
    }
    wake()
    if (!pending?.source || pending.source !== source) return
    const done = finish()
    if (!done?.range || !usable()) return
    // The grip follows the block to its new place, so it can move on from there.
    const found = article()?.querySelector<HTMLElement>(`[data-plan-block="${done.range}"]`)
    if (!found || !isMovable(found)) return
    show(found)
    if (done.menu) openMenu(done.focus)
    else if (done.focus) grip.focus({ preventScroll: true })
  }
  /** The grip, and a menu open on it, go to the element that draws their block now. */
  function follow() {
    if (!block || block.isConnected) return
    if (!relink()) {
      hide()
      return
    }
    place()
    // A menu opened beside an editor counts the block's neighbours again.
    if (menuOpen) openMenu(false)
  }
  const refresh = () => {
    if (!usable() && !pending) hide()
    // An editor closed without a change: the page drew the same file, with the block where the editor was.
    else follow()
    wake()
  }

  const aim = () => {
    if (!drag) return
    let best: MoveSlot | null = null
    let distance = Number.POSITIVE_INFINITY
    for (const slot of moveSlotsFor(drag.block)) {
      const gap = Math.abs(slot.y - drag.y)
      if (gap < distance) {
        distance = gap
        best = slot
      }
    }
    drag.slot = best
    line.hidden = best === null
    if (!best) return
    line.dataset.level = best.container ? 'phase' : 'top'
    line.style.top = `${best.y + window.scrollY - 1.5}px`
    line.style.left = `${best.left + window.scrollX}px`
    line.style.width = `${best.width}px`
  }
  const edgeScroll = () => {
    if (!drag?.moved) return
    const titleBar = document.querySelector('header.titlebar')?.getBoundingClientRect().bottom ?? 0
    const by = drag.y < titleBar + SCROLL_EDGE ? -SCROLL_STEP : drag.y > window.innerHeight - SCROLL_EDGE ? SCROLL_STEP : 0
    if (by !== 0) {
      window.scrollBy(0, by)
      aim()
    }
    scrollFrame = requestAnimationFrame(edgeScroll)
  }
  const endDrag = (cancelled: boolean) => {
    const current = drag
    if (!current) return
    drag = null
    cancelAnimationFrame(scrollFrame)
    line.hidden = true
    current.block.removeAttribute('data-plan-moving')
    delete document.body.dataset.planBlockMoving
    if (grip.hasPointerCapture(current.pointerId)) grip.releasePointerCapture(current.pointerId)
    if (!current.moved) return
    // The click that follows the release is not a click on the grip.
    clickAfterDrag = true
    window.setTimeout(() => {
      clickAfterDrag = false
    }, 0)
    if (cancelled || !current.slot || isSameSlot(current.block, current.slot)) {
      if (current.block.isConnected) show(current.block)
      return
    }
    void commit(current.block.isConnected ? placeHere(current.block) : current.from, placeHere(current.slot.target), current.slot.place, {
      menu: false,
      focus: false,
    })
  }
  const onGripDown = (event: PointerEvent) => {
    if (!block || event.button !== 0 || !usable()) return
    // No text selection, and no focus taken from where the reader is.
    event.preventDefault()
    const from = block.isConnected ? placeHere(block) : anchor
    // A press on the grip finishes an open edit, as a click outside it does. The move starts from that edit.
    if (options.state().editing) options.finishEditing()
    grip.setPointerCapture(event.pointerId)
    drag = { block, from, pointerId: event.pointerId, startY: event.clientY, y: event.clientY, moved: false, slot: null }
  }
  const onGripMove = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return
    drag.y = event.clientY
    if (!drag.moved) {
      if (Math.abs(event.clientY - drag.startY) < DRAG_THRESHOLD) return
      drag.moved = true
      closeMenu()
      drag.block.setAttribute('data-plan-moving', '')
      document.body.dataset.planBlockMoving = ''
      scrollFrame = requestAnimationFrame(edgeScroll)
    }
    aim()
  }
  const onGripUp = (event: PointerEvent) => {
    if (drag?.pointerId === event.pointerId) endDrag(false)
  }
  const onGripCancel = (event: PointerEvent) => {
    if (drag?.pointerId === event.pointerId) endDrag(true)
  }
  const onGripClick = (event: MouseEvent) => {
    if (clickAfterDrag || !block) return
    if (menuOpen) closeMenu()
    // A press with a mouse leaves focus where it was; Enter or Space on the grip moves it into the menu.
    else if (usable()) openMenu(event.detail === 0)
  }
  /** Delete, once asked: an open edit is finished first, then the block goes, as one more unapplied change. */
  const onDelete = async () => {
    if (!block || remove.disabled) return
    if (remove.dataset.confirm === undefined) {
      remove.dataset.confirm = ''
      removeText.textContent = DELETE_ASK
      return
    }
    const from = block.isConnected ? placeHere(block) : anchor
    hide()
    if (options.state().editing) {
      options.finishEditing()
      if (!(await whenIdle())) return
    }
    const current = blockAt(from)
    const range = current?.dataset.planBlock
    if (!range || !usable()) return
    await options.remove(range)
  }
  const onRemove = () => void onDelete()
  const onUp = () => void step(block, -1, { menu: true, focus: document.activeElement === up })
  const onDown = () => void step(block, 1, { menu: true, focus: document.activeElement === down })
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      if (drag) endDrag(true)
      else if (menuOpen) {
        const focused = menu.contains(document.activeElement)
        closeMenu()
        if (focused) grip.focus({ preventScroll: true })
      }
      return
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const target = event.target
    const fromTools = inTools(target)
    if (!fromTools && target instanceof HTMLElement && (target.closest('input, textarea, select') || target.isContentEditable)) return
    if (!usable()) return
    const moving = fromTools ? block : movableFrom(editTargetOf(document.activeElement))
    if (!moving) return
    event.preventDefault()
    if (!fromTools) show(moving)
    void step(moving, event.key === 'ArrowUp' ? -1 : 1, { menu: menuOpen, focus: true })
  }
  // A press anywhere else closes the menu.
  const onPress = (event: PointerEvent) => {
    if (menuOpen && !inTools(event.target)) closeMenu()
  }

  grip.addEventListener('pointerdown', onGripDown)
  grip.addEventListener('pointermove', onGripMove)
  grip.addEventListener('pointerup', onGripUp)
  grip.addEventListener('pointercancel', onGripCancel)
  grip.addEventListener('lostpointercapture', onGripCancel)
  grip.addEventListener('click', onGripClick)
  up.addEventListener('click', onUp)
  down.addEventListener('click', onDown)
  remove.addEventListener('click', onRemove)
  document.addEventListener('pointermove', onPointer, { passive: true })
  // Heard on the window as it goes down, so a component that keeps its pointer events still shows its grip.
  window.addEventListener('pointerup', onTap, { capture: true, passive: true })
  document.addEventListener('pointerdown', onPress, { passive: true })
  document.addEventListener('focusin', onFocus)
  document.addEventListener('keydown', onKey)
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll)
  const stop = () => {
    cancelAnimationFrame(frame)
    cancelAnimationFrame(scrollFrame)
    window.clearTimeout(hideTimer)
    finish()
    if (drag) endDrag(true)
    grip.removeEventListener('pointerdown', onGripDown)
    grip.removeEventListener('pointermove', onGripMove)
    grip.removeEventListener('pointerup', onGripUp)
    grip.removeEventListener('pointercancel', onGripCancel)
    grip.removeEventListener('lostpointercapture', onGripCancel)
    grip.removeEventListener('click', onGripClick)
    up.removeEventListener('click', onUp)
    down.removeEventListener('click', onDown)
    remove.removeEventListener('click', onRemove)
    document.removeEventListener('pointermove', onPointer)
    window.removeEventListener('pointerup', onTap, { capture: true })
    document.removeEventListener('pointerdown', onPress)
    document.removeEventListener('focusin', onFocus)
    document.removeEventListener('keydown', onKey)
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onScroll)
    grip.remove()
    menu.remove()
    line.remove()
  }
  return { stop, rendered, refresh }
}
