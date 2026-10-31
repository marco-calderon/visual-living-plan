/** Sets `data-theme` before the plan stylesheet paints, including when the system theme changes. */
export const themeBootstrapScript = `(() => {
  const root = document.documentElement
  const apply = () => {
    root.dataset.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  apply()
  if (root.dataset.themeBound === 'true') return
  root.dataset.themeBound = 'true'
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', apply)
})();`
