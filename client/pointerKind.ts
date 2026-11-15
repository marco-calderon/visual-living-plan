/* ----------------------------------------------------------------------------------------------
 * Taps and clicks. A finger or a pen has no hover before it touches, so the page shows a block's
 * pill and finishes an open edit on a tap, where a mouse does it on hover and on the press. Safari
 * may leave `pointerType` empty on the `click` that follows a tap, so the kind of the last press
 * stands in for it.
 * ------------------------------------------------------------------------------------------- */

let lastPress = 'mouse'

if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointerdown',
    (event) => {
      lastPress = event.pointerType || 'mouse'
    },
    { capture: true, passive: true },
  )
}

/** True for a finger or a pen: a pointer with no hover before it touches. */
export function isTouchPointer(event: PointerEvent): boolean {
  return event.pointerType === 'touch' || event.pointerType === 'pen'
}

/** True when a click came from a tap: a finger or a pen, read from the click or from the press before it. */
export function isTap(event: MouseEvent): boolean {
  const kind = (event as Partial<PointerEvent>).pointerType || lastPress
  return kind === 'touch' || kind === 'pen'
}
