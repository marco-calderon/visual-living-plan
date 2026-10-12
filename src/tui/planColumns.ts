import type { Style } from '@semos-labs/glyph'

/**
 * Fixed column widths so the header and every row share the same grid.
 * Content min-width would otherwise push each row to a different size.
 */
export const planColumn = {
  plan: { width: 38, flexShrink: 0 },
  status: { width: 14, flexShrink: 0 },
  completion: { width: 28, flexShrink: 0 },
  folder: { width: 20, flexShrink: 0 },
  files: { width: 6, flexShrink: 0 },
  started: { width: 20, flexShrink: 0 },
  duration: { width: 10, flexShrink: 0 },
  actions: { width: 16, flexShrink: 0 },
} as const satisfies Record<string, Style>
