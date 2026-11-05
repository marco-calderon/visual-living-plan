export type Appearance = {
  accent: string
  pageWidth: string
  diffsTheme: string
  wrapCode: boolean
}

/**
 * Put appearance settings on the page: the root data attributes the styles read and the body layout class.
 * Returns whether anything changed. With `notify`, a change is announced as `living-plan-theme` so code blocks and the canvas follow.
 */
export function applyAppearance(appearance: Appearance, options: { notify?: boolean } = {}): boolean {
  if (typeof document === 'undefined') return false
  const root = document.documentElement
  const wrapCode = appearance.wrapCode ? 'true' : 'false'
  const changed =
    root.dataset.accent !== appearance.accent ||
    root.dataset.layout !== appearance.pageWidth ||
    root.dataset.diffsTheme !== appearance.diffsTheme ||
    root.dataset.wrapCode !== wrapCode
  root.dataset.accent = appearance.accent
  root.dataset.layout = appearance.pageWidth
  root.dataset.diffsTheme = appearance.diffsTheme
  root.dataset.wrapCode = wrapCode
  document.body.classList.remove('layout-default', 'layout-wide', 'layout-full')
  document.body.classList.add(`layout-${appearance.pageWidth}`)
  if (changed && options.notify) {
    window.dispatchEvent(new CustomEvent('living-plan-theme', { detail: { ...appearance } }))
  }
  return changed
}
