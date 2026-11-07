import { useEffect, type RefObject } from 'react'

// The editor listens for these on its root. A control inside a card keeps them, so typing,
// pasting, and arrow keys stay in the input. React's change events use `input`, which still bubbles.
const KEPT = ['keydown', 'keypress', 'keyup', 'beforeinput', 'paste', 'cut', 'copy', 'drop'] as const

export function useIsolatedFromEditor(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const stop = (event: Event) => {
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLButtonElement) {
        event.stopPropagation()
      }
    }
    for (const type of KEPT) node.addEventListener(type, stop)
    return () => {
      for (const type of KEPT) node.removeEventListener(type, stop)
    }
  }, [ref])
}
