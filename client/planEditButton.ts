/* ----------------------------------------------------------------------------------------------
 * Edit a block where it sits (ADR 0040). The page is both the reader and the editor: while the
 * plan can be edited, the block under the pointer (or with focus, or tapped) shows a small pill
 * with Edit and +. Edit opens that block's editor in its place; + opens a new block below it. E
 * edits the block with focus, or the one at the reading line. One pill follows the pointer, so the
 * page's blocks stay as React drew them.
 * ------------------------------------------------------------------------------------------- */

/** The key that edits the block with focus. */
export const BLOCK_EDIT_KEY = 'E'

type EditState = { editable: boolean; editing: boolean }

export type BlockEditActions = {
  state: () => EditState
  /** Open the editor for the block at this range (its `data-plan-block`). */
  edit: (range: string) => void
  /** Open a new block's editor after the block at this range. */
  add: (after: string) => void
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

/** A block the plan marks `locked`, or one inside a locked block, or an answer card that keeps its default lock. */
export function isEditLocked(block: Element): boolean {
  return block.closest('[data-edit-locked="true"]') !== null || block.querySelector(':scope > [data-edit-locked="true"]') !== null
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

export function bindBlockEditButton(options: BlockEditActions): () => void {
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
    const next = usable() ? editTargetOf(target) : null
    if (next && !isEditLocked(next)) {
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
    const shown = tools.hasAttribute('data-visible') ? block : null
    const focused = editTargetOf(document.activeElement)
    const next = [shown, focused && !isEditLocked(focused) ? focused : null, blockAtReadingLine()].find(
      (candidate): candidate is HTMLElement => Boolean(candidate?.dataset.planBlock),
    )
    hide()
    if (next?.dataset.planBlock) options.edit(next.dataset.planBlock)
  }
  // Focus moving into a block (a folder, a tab, a link) shows its pill too, and E edits it.
  const onFocus = (event: FocusEvent) => {
    if (event.target instanceof Node && tools.contains(event.target)) return
    track(event.target)
  }
  edit.addEventListener('click', onEdit)
  add.addEventListener('click', onAdd)
  document.addEventListener('pointerover', onPointer, { passive: true })
  document.addEventListener('pointerup', onTap, { passive: true })
  document.addEventListener('focusin', onFocus)
  document.addEventListener('keydown', onKey)
  window.addEventListener('scroll', onMove, { passive: true })
  window.addEventListener('resize', onMove)
  return () => {
    cancelAnimationFrame(frame)
    window.clearTimeout(hideTimer)
    edit.removeEventListener('click', onEdit)
    add.removeEventListener('click', onAdd)
    document.removeEventListener('pointerover', onPointer)
    document.removeEventListener('pointerup', onTap)
    document.removeEventListener('focusin', onFocus)
    document.removeEventListener('keydown', onKey)
    window.removeEventListener('scroll', onMove)
    window.removeEventListener('resize', onMove)
    tools.remove()
  }
}
