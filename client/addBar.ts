/**
 * The size of the + bar between blocks, on the page (client/planEditButton.ts) and in the editor
 * (client/editor/blockHandles.tsx). The bar sits in the middle of the gap under a block and keeps
 * clear of the blocks above and below it: in a narrow gap it is shorter, and when it gets too short
 * for its + it is a slim line. Match .plan-add-bar (client/entries/primitives.css) and
 * .plan-block-add (client/editor/planEditor.css).
 */

/** The bar's height where the gap has room for it. */
export const BAR_HEIGHT = 10
/** The room the bar keeps from the block above it and the block below it. */
export const BAR_CLEAR = 3
/** The slimmest the bar gets, in the narrowest gap. */
const BAR_MIN = 4
/** Under this height the bar has no room for its + (a 10px icon whose cross is about 6px). */
const BAR_ICON_MIN = 6

export type BarFit = {
  /** From the top of the gap to the top of the bar. */
  offset: number
  height: number
  /** The gap has no room for a click target past the bar's own edges. */
  tight: boolean
  /** Too short for the +: the bar is a line. */
  slim: boolean
}

/** Where the bar goes in a gap `gap` pixels tall, and how tall it is. */
export function barFit(gap: number): BarFit {
  const height = Math.max(BAR_MIN, Math.min(BAR_HEIGHT, gap - 2 * BAR_CLEAR))
  return {
    offset: (gap - height) / 2,
    height,
    tight: gap < height + 2 * BAR_CLEAR,
    slim: height < BAR_ICON_MIN,
  }
}
