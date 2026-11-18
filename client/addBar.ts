/**
 * The + bar between blocks, on the page (client/planEditButton.ts) and in the editor
 * (client/editor/blockHandles.tsx). Every + bar has one height, --add-bar-size in
 * client/entries/primitives.css: these bars, and a table's add-row and add-column bars. The bar sits
 * in the middle of the gap under a block.
 */

/** Every + bar's height. Match --add-bar-size in client/entries/primitives.css. */
export const BAR_HEIGHT = 8
/** The room the bar's click target may take from the gap above and below the bar. */
export const BAR_CLEAR = 3

export type BarFit = {
  /** From the top of the gap to the top of the bar. */
  offset: number
  /** The gap has no room for a click target past the bar's own edges. */
  tight: boolean
}

/** Where the bar goes in a gap `gap` pixels tall: in its middle. */
export function barFit(gap: number): BarFit {
  return { offset: (gap - BAR_HEIGHT) / 2, tight: gap < BAR_HEIGHT + 2 * BAR_CLEAR }
}
