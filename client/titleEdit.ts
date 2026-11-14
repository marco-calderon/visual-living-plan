/* ----------------------------------------------------------------------------------------------
 * A card's title, edited as it reads (ADR 0040). The title's own text turns editable where it is,
 * with the caret where the click landed: same font, same place, no frame. Enter, a press outside it,
 * or a Tab out of it keeps the edit; Escape keeps it too, and closes it when nothing was typed.
 *
 * React drew the title's text. While it is edited the browser changes those nodes, so the edit
 * puts React's own nodes back, as they were, before it reports the text. React then draws the new
 * title from the plan file, as it would any other change.
 * ------------------------------------------------------------------------------------------- */

import { placeCaret } from './caretSpot.ts'

export type TitleEditOptions = {
  /** Characters into the title where the caret goes. At the end when not given. */
  caret?: number
  /** The title was changed to `text` (one line). Resolves to false when the change was not kept: the title shows its old text again. */
  done: (text: string) => boolean | Promise<boolean>
  /** The title closed with nothing changed. */
  cancel: () => void
}

function inside(element: HTMLElement, target: EventTarget | null): boolean {
  return target instanceof Node && element.contains(target)
}

/** The title's text as the reader typed it: one line, with the spaces an editable box writes as no-break spaces made plain. */
export function typedTitle(element: Element): string {
  return (element.textContent ?? '').replace(/ /g, ' ').replace(/\s*[\r\n]+\s*/g, ' ')
}

/** Make `element` editable where it is. Returns a stop that puts it back without reporting anything. */
export function editTitleInPlace(element: HTMLElement, options: TitleEditOptions): () => void {
  const nodes = Array.from(element.childNodes)
  const data = nodes.map((node) => (node instanceof Text ? node.data : null))
  const before = typedTitle(element)
  // A title inside a link (a phase's, which jumps to the workflow) must not drag the link while text is selected.
  const link = element.closest('a')
  const linkDraggable = link?.getAttribute('draggable') ?? null
  link?.setAttribute('draggable', 'false')
  element.contentEditable = 'plaintext-only'
  // Browsers without plain-text editing take any edit; a paste is still read as text below.
  if (element.contentEditable !== 'plaintext-only') element.contentEditable = 'true'
  element.dataset.planTitleEditing = ''
  element.setAttribute('role', 'textbox')
  element.setAttribute('aria-label', 'Title')
  element.spellcheck = true
  let finished = false

  /** React's own nodes, with the text React gave them, or with `shown` in its one text node until React draws the new title. */
  const putBack = (shown?: string) => {
    element.replaceChildren(...nodes)
    const texts = nodes.filter((node): node is Text => node instanceof Text)
    nodes.forEach((node, index) => {
      const text = data[index]
      if (node instanceof Text && text !== null && text !== undefined && node.data !== text) node.data = text
    })
    if (shown !== undefined && texts.length === 1 && nodes.length === 1) texts[0]!.data = shown
  }

  const restore = (shown?: string) => {
    element.removeAttribute('contenteditable')
    delete element.dataset.planTitleEditing
    element.removeAttribute('role')
    element.removeAttribute('aria-label')
    element.removeAttribute('spellcheck')
    if (link) {
      if (linkDraggable === null) link.removeAttribute('draggable')
      else link.setAttribute('draggable', linkDraggable)
    }
    putBack(shown)
    document.removeEventListener('pointerdown', onPointerDown, true)
    window.removeEventListener('click', onClick, true)
    element.removeEventListener('keydown', onKeyDown)
    element.removeEventListener('beforeinput', onBeforeInput)
    element.removeEventListener('paste', onPaste)
    element.removeEventListener('focusout', onFocusOut)
  }

  const finish = (keep: boolean) => {
    if (finished) return
    finished = true
    const text = typedTitle(element).trim()
    const blurred = document.activeElement === element
    // An emptied title keeps the one it had: a card cannot be left without its title.
    const changed = keep && text !== '' && text !== before.trim()
    restore(changed ? text : undefined)
    if (blurred) element.blur()
    if (!changed) {
      options.cancel()
      return
    }
    void Promise.resolve(options.done(text)).then(
      (kept) => {
        if (!kept) putBack()
      },
      () => putBack(),
    )
  }

  // A mouse finishes at the press outside. A finger finishes at the tap: its press may start a scroll.
  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType !== 'touch' && !inside(element, event.target)) finish(true)
  }
  const onClick = (event: MouseEvent) => {
    if (inside(element, event.target)) {
      // A click that moves the caret in the title does not follow the link the title sits in.
      event.preventDefault()
      return
    }
    if ((event as PointerEvent).pointerType === 'touch') finish(true)
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.isComposing) return
    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      finish(true)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      finish(typedTitle(element) !== before)
    }
  }
  // A title is one line.
  const onBeforeInput = (event: InputEvent) => {
    if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') event.preventDefault()
  }
  const onPaste = (event: ClipboardEvent) => {
    const text = event.clipboardData?.getData('text/plain')
    if (text === undefined) return
    event.preventDefault()
    document.execCommand('insertText', false, text.replace(/\s*[\r\n]+\s*/g, ' '))
  }
  // Focus going elsewhere in the page (a Tab out) is Done. Focus leaving the window is not.
  const onFocusOut = (event: FocusEvent) => {
    if (event.relatedTarget === null || inside(element, event.relatedTarget)) return
    finish(true)
  }

  document.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('click', onClick, true)
  element.addEventListener('keydown', onKeyDown)
  element.addEventListener('beforeinput', onBeforeInput)
  element.addEventListener('paste', onPaste)
  element.addEventListener('focusout', onFocusOut)
  element.focus({ preventScroll: true })
  if (!placeCaret(element, options.caret ?? Number.MAX_SAFE_INTEGER)) {
    const selection = window.getSelection()
    selection?.selectAllChildren(element)
    selection?.collapseToEnd()
  }

  return () => {
    if (finished) return
    finished = true
    restore()
  }
}
