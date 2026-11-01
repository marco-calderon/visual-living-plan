import { DEFAULT_DIFFS_THEME, DIFFS_THEME_PRESETS, diffsThemePreset, type DiffsThemePreset, type DiffsThemeSample } from './diffsTheme'

export type AppearancePreset = { label: string; accent: string }

export type AppearanceWidth = { id: string; label: string }

export type AppearanceSettingsInput = {
  accent: string
  pageWidth: string
  diffsTheme: string
  wrapCode: boolean
  presets: AppearancePreset[]
  widths: AppearanceWidth[]
  diffsThemes?: DiffsThemePreset[]
  /** Replaces the accent explanation. The plan page uses the theme-file sentence. */
  accentCopy?: string
  /** Trusted HTML for the line under each control. */
  accentNote: string
  widthNote: string
  wrapNote: string
  diffsNote: string
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function diffsThemeSampleMarkup(sample: DiffsThemeSample, mode: 'Light' | 'Dark'): string {
  const style = [
    `--sample-bg:${sample.bg}`,
    `--sample-fg:${sample.fg}`,
    `--sample-comment:${sample.comment}`,
    `--sample-string:${sample.string}`,
    `--sample-keyword:${sample.keyword}`,
    `--sample-function:${sample.function}`,
    `--sample-added:${sample.added}`,
    `--sample-deleted:${sample.deleted}`,
  ].join(';')
  return `<div class="diffs-theme-sample" style="${escapeHtml(style)}" aria-hidden="true" title="${mode}">
    <span class="tok-comment">// ${mode}</span>
    <span><span class="tok-keyword">const</span> <span class="tok-fn">n</span> = <span class="tok-string">'ok'</span></span>
    <span><span class="tok-added">+ keep</span> <span class="tok-deleted">- drop</span></span>
  </div>`
}

function diffsThemeOptionsMarkup(presets: DiffsThemePreset[], selectedId: string): string {
  return presets
    .map((preset) => {
      const selected = preset.id === selectedId
      return `<button
          type="button"
          class="diffs-theme-option"
          data-diffs-theme="${escapeHtml(preset.id)}"
          data-diffs-theme-label="${escapeHtml(preset.label)}"
          aria-label="${escapeHtml(preset.label)} theme"
          aria-checked="${selected ? 'true' : 'false'}"
          title="${escapeHtml(preset.description)}"
        >
          <div class="diffs-theme-samples">
            ${diffsThemeSampleMarkup(preset.lightSample, 'Light')}
            ${diffsThemeSampleMarkup(preset.darkSample, 'Dark')}
          </div>
          <span class="diffs-theme-option-meta">
            <strong>${escapeHtml(preset.label)}</strong>
            <span>${escapeHtml(preset.description)}</span>
          </span>
        </button>`
    })
    .join('')
}

/** Appearance controls from the plan Settings tab. Local and cloud both render this. */
export function appearanceSettingsHtml(input: AppearanceSettingsInput): string {
  const swatches = input.presets
    .map((preset) => {
      const selected = preset.accent === input.accent
      return `<button
          type="button"
          class="theme-swatch"
          style="--swatch:${escapeHtml(preset.accent)}"
          data-accent-swatch="${escapeHtml(preset.accent)}"
          aria-label="${escapeHtml(preset.label)} accent"
          aria-checked="${selected ? 'true' : 'false'}"
          title="${escapeHtml(preset.label)}"
        >${escapeHtml(preset.label)}</button>`
    })
    .join('')
  const widthChoices = input.widths
    .map((option) => {
      const selected = option.id === input.pageWidth
      return `<button type="button" class="width-choice" role="radio" data-page-width="${escapeHtml(option.id)}" aria-checked="${selected ? 'true' : 'false'}">${escapeHtml(option.label)}</button>`
    })
    .join('')
  const diffsThemeId = input.diffsTheme || DEFAULT_DIFFS_THEME
  const diffsPresets = input.diffsThemes?.length ? input.diffsThemes : DIFFS_THEME_PRESETS
  const currentDiffs = diffsThemePreset(diffsThemeId)
  const wrapCode = input.wrapCode === true
  return `<section class="block settings-section" data-section>
          <div class="settings-kicker">Appearance</div>
          <h3>Accent color</h3>
          <p class="settings-copy">${escapeHtml(input.accentCopy ?? 'Pick one of eight presets tuned for light and dark mode, or set a custom hex. Changes save to the theme config and update the page live.')}</p>
          <div class="settings-preview">
            <span class="chip"><span class="live-dot"></span> Preview</span>
            <span class="chip">Accent <strong id="theme-accent-hex">${escapeHtml(input.accent)}</strong></span>
          </div>
          <div class="theme-swatches" role="radiogroup" aria-label="Accent presets">
            ${swatches}
          </div>
          <label class="theme-custom">
            <span>Custom</span>
            <input id="theme-accent-picker" type="color" value="${escapeHtml(input.accent)}" aria-label="Custom accent color" />
            <code id="theme-accent-custom-hex">${escapeHtml(input.accent)}</code>
          </label>
          <p class="settings-meta">${input.accentNote}</p>
        </section>
        <section class="block settings-section" data-section>
          <div class="settings-kicker">Layout</div>
          <h3>Page width</h3>
          <p class="settings-copy">Choose the document column. Default, wide, and full apply to Plan, Workflow, and Settings. Full uses the available width.</p>
          <div class="width-choices" role="radiogroup" aria-label="Page width">
            ${widthChoices}
          </div>
          <p class="settings-meta">${input.widthNote}</p>
        </section>
        <section class="block settings-section" data-section>
          <div class="settings-kicker">Code &amp; diffs</div>
          <div class="code-wrap-setting">
            <div class="code-wrap-copy">
              <h3 id="code-wrap-label">Wrap text in code</h3>
              <p class="settings-copy">Long lines wrap inside code blocks, in light and dark. Turn this off to scroll sideways.</p>
            </div>
            <button
              type="button"
              class="plan-switch"
              data-size="default"
              data-code-wrap
              role="switch"
              aria-checked="${wrapCode ? 'true' : 'false'}"
              aria-labelledby="code-wrap-label"
            >
              <span class="plan-switch-thumb"${wrapCode ? ' data-checked=""' : ''}></span>
            </button>
          </div>
          <p class="settings-meta">${input.wrapNote}</p>
          <h3>Pierre theme</h3>
          <p class="settings-copy">Choose the Pierre syntax theme used for code blocks and diffs. Light and dark samples follow the page color mode.</p>
          <div class="settings-accordion" data-accordion data-open="false">
            <button
              type="button"
              class="settings-accordion-trigger"
              data-accordion-trigger
              id="diffs-theme-toggle"
              aria-expanded="false"
              aria-controls="diffs-theme-panel"
            >
              <span class="settings-accordion-trigger-copy">
                <strong>Diff theme</strong>
                <span>Current: <strong id="diffs-theme-current">${escapeHtml(currentDiffs.label)}</strong></span>
              </span>
              <svg class="settings-accordion-chevron" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                <path fill="currentColor" d="M5.2 7.5a.9.9 0 0 1 1.27-.05L10 10.74l3.53-3.29a.9.9 0 0 1 1.22 1.32l-4.14 3.86a.9.9 0 0 1-1.22 0L5.25 8.77a.9.9 0 0 1-.05-1.27z"/>
              </svg>
            </button>
            <div class="settings-accordion-panel" id="diffs-theme-panel" data-accordion-panel inert>
              <div class="settings-accordion-panel-inner">
                <div class="settings-accordion-body">
                  <div class="diffs-theme-grid" role="radiogroup" aria-label="Pierre diff themes">
                    ${diffsThemeOptionsMarkup(diffsPresets, currentDiffs.id)}
                  </div>
                  <p class="settings-meta" style="margin-top:0.85rem">${input.diffsNote}</p>
                </div>
              </div>
            </div>
          </div>
        </section>`
}

/** Saves the shared appearance controls. The plan page keeps its own live theme script. */
export function appearanceSettingsScript(endpoint: string): string {
  const target = JSON.stringify(endpoint)
  return `<script>
    if (!window.__livingPlanAppearanceBound) {
    window.__livingPlanAppearanceBound = true
    async function saveAppearance(partial) {
      const error = document.querySelector('[data-settings-error]')
      if (error) error.textContent = ''
      const response = await fetch(${target}, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(partial),
      })
      if (!response.ok) {
        if (error) error.textContent = 'Could not save those settings.'
        return
      }
      location.reload()
    }
    document.querySelectorAll('[data-accent-swatch]').forEach((button) => {
      button.addEventListener('click', () => {
        const accent = button.getAttribute('data-accent-swatch')
        if (!accent || accent === document.documentElement.dataset.accent) return
        void saveAppearance({ accent })
      })
    })
    const picker = document.getElementById('theme-accent-picker')
    if (picker) {
      picker.addEventListener('change', () => {
        if (!('value' in picker)) return
        void saveAppearance({ accent: picker.value })
      })
    }
    document.querySelectorAll('[data-page-width]').forEach((button) => {
      button.addEventListener('click', () => {
        const pageWidth = button.getAttribute('data-page-width')
        if (!pageWidth || pageWidth === document.documentElement.dataset.layout) return
        void saveAppearance({ pageWidth })
      })
    })
    document.querySelector('[data-code-wrap]')?.addEventListener('click', () => {
      void saveAppearance({ wrapCode: document.documentElement.dataset.wrapCode !== 'true' })
    })
    document.querySelectorAll('[data-accordion]').forEach((accordion) => {
      const trigger = accordion.querySelector('[data-accordion-trigger]')
      const panel = accordion.querySelector('[data-accordion-panel]')
      if (!trigger) return
      const setOpen = (next) => {
        accordion.setAttribute('data-open', next ? 'true' : 'false')
        trigger.setAttribute('aria-expanded', next ? 'true' : 'false')
        if (panel) {
          if (next) panel.removeAttribute('inert')
          else panel.setAttribute('inert', '')
        }
      }
      trigger.addEventListener('click', () => {
        setOpen(accordion.getAttribute('data-open') !== 'true')
      })
    })
    document.addEventListener('click', (event) => {
      const target = event.target
      const button = target instanceof Element ? target.closest('[data-diffs-theme]') : null
      if (!(button instanceof HTMLElement)) return
      const diffsTheme = button.getAttribute('data-diffs-theme')
      if (!diffsTheme || diffsTheme === document.documentElement.dataset.diffsTheme) return
      void saveAppearance({ diffsTheme })
    })
    }
  </script>`
}

/** Document tokens and cards for the cloud settings page. Matches the plan Settings tab. */
export const settingsDocumentCss = `
:root {
  color-scheme: light;
  --brand-blue: #2563eb;
  --brand-blue-deep: #1d4ed8;
  --brand-blue-200: #dbeafe;
  --canvas: #ffffff;
  --surface: #f4f4f5;
  --hairline: #e4e4e7;
  --ink: #18181b;
  --charcoal: #27272a;
  --steel: #71717a;
  --primary: #09090b;
  --on-primary: #ffffff;
  --paper: var(--canvas);
  --line: var(--hairline);
  --muted: var(--steel);
  --accent: var(--brand-blue-deep);
  --radius: 16px;
  --space-sm: 12px;
  --space-md: 16px;
  --space-xl: 24px;
  --space-xxl: 32px;
  --space-section: 64px;
  --font-display: "DM Sans", Inter, "Helvetica Neue", Helvetica, Arial, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  --chip-bg: var(--surface);
  --tabs-bg: var(--surface);
  --control-solid: var(--canvas);
  --tab-active-bg: var(--primary);
  --tab-active-fg: var(--on-primary);
  --accent-soft: var(--brand-blue-200);
  --accent-hover-border: var(--brand-blue);
  --code-inline-bg: var(--brand-blue-200);
  --focus: var(--brand-blue-deep);
}
@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --canvas: #0c0c0e;
    --surface: #18181b;
    --hairline: #27272a;
    --ink: #fafafa;
    --charcoal: #e4e4e7;
    --steel: #a1a1aa;
    --primary: #fafafa;
    --on-primary: #0c0c0e;
    --accent: #93c5fd;
    --accent-soft: rgba(147, 197, 253, 0.14);
    --accent-hover-border: #93c5fd;
    --code-inline-bg: rgba(147, 197, 253, 0.16);
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--canvas);
  color: var(--charcoal);
  font-family: var(--font-display);
  font-size: 16px;
  line-height: 1.5;
}
main.settings-page {
  width: min(720px, calc(100% - var(--space-xxl) * 2));
  margin: var(--space-xxl) auto var(--space-section);
}
body.layout-wide main.settings-page { width: min(1120px, calc(100% - var(--space-xxl) * 2)); }
body.layout-full main.settings-page { width: calc(100% - var(--space-xxl) * 2); }
.kicker {
  margin: 0 0 var(--space-sm);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
}
h1 {
  margin: 0 0 var(--space-md);
  color: var(--ink);
  font-size: 24px;
  font-weight: 600;
  line-height: 1.3;
}
.nav { display: flex; gap: var(--space-sm); align-items: center; flex-wrap: wrap; margin: 0 0 var(--space-md); }
.nav a { color: var(--accent); font-size: 14px; font-weight: 600; text-decoration: none; }
.nav a[aria-current="page"] { text-decoration: underline; }
.nav button.secondary,
.nav .plan-btn-secondary {
  padding: 8px 12px;
  border: 1px solid var(--ink);
  border-radius: 9999px;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
  cursor: pointer;
}
.block {
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: var(--radius);
  padding: var(--space-md);
  box-shadow: none;
}
`

export const appearanceSettingsCss = `
.settings-stack {
  display: grid;
  gap: var(--space-md);
}
.settings-kicker {
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent);
  font-weight: 600;
  margin: 0 0 0.35rem;
}
.settings-section h3 {
  margin: 0 0 0.45rem;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 1.35rem;
}
.settings-copy {
  margin: 0 0 1rem;
  color: var(--muted);
  line-height: 1.5;
}
.settings-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin: 0 0 1.1rem;
}
.theme-swatches {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr));
  gap: 0.55rem;
  margin: 0 0 1rem;
}
.theme-swatch {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--control-solid);
  color: var(--ink);
  padding: 0.7rem 0.85rem;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
}
.theme-swatch::before {
  content: "";
  width: 1.1rem;
  height: 1.1rem;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--swatch, var(--accent));
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
}
.theme-swatch:hover {
  border-color: var(--accent-hover-border);
  box-shadow: var(--accent-hover-shadow);
}
.theme-swatch[aria-checked="true"] {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.theme-swatch:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.theme-custom {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.65rem 0.9rem;
  margin: 0 0 0.85rem;
  font-size: 0.92rem;
  color: var(--muted);
}
.theme-custom input[type="color"] {
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
}
.theme-custom code {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--ink);
}
.settings-meta {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.5;
}
.settings-meta code {
  font-family: var(--font-mono);
  font-size: 0.86em;
  background: var(--code-inline-bg);
  padding: 0.1rem 0.35rem;
  border-radius: 6px;
}
.width-choices {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.15rem;
  margin: 0 0 0.85rem;
  padding: 0.18rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--tabs-bg);
}
.width-choice {
  border: 0;
  background: transparent;
  color: var(--ink);
  border-radius: 999px;
  padding: 8px 12px;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
  cursor: pointer;
}
.width-choice[aria-checked="true"] {
  background: var(--tab-active-bg);
  color: var(--tab-active-fg);
}
.width-choice:hover {
  color: var(--ink);
}
.width-choice[aria-checked="true"]:hover {
  color: var(--tab-active-fg);
}
.width-choice:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.code-wrap-setting {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin: 0 0 1.15rem;
}
.code-wrap-copy {
  min-width: 0;
}
.code-wrap-copy h3 {
  margin: 0;
}
.code-wrap-copy .settings-copy {
  margin: 0.35rem 0 0;
}
.code-wrap-control {
  display: inline-flex;
  flex: none;
}
.plan-switch {
  --switch-track: #e4e4e7;
  --switch-thumb: var(--canvas);
  position: relative;
  box-sizing: border-box;
  display: inline-flex;
  flex: none;
  align-items: center;
  width: 32px;
  height: 18.4px;
  margin: 0;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 999px;
  background: var(--switch-track);
  color: inherit;
  cursor: pointer;
  appearance: none;
  transition: background-color 150ms ease;
}
.plan-switch[data-size="sm"] {
  width: 24px;
  height: 14px;
}
:root[data-theme="dark"] .plan-switch {
  --switch-track: #3f3f46;
  --switch-thumb: var(--ink);
}
:root .plan-switch[data-checked],
:root .plan-switch[aria-checked="true"],
:root[data-theme="dark"] .plan-switch[data-checked],
:root[data-theme="dark"] .plan-switch[aria-checked="true"] {
  --switch-track: var(--primary);
}
:root[data-theme="dark"] .plan-switch[data-checked],
:root[data-theme="dark"] .plan-switch[aria-checked="true"] {
  --switch-thumb: var(--on-primary);
}
.plan-switch[data-disabled],
.plan-switch[aria-disabled="true"] {
  cursor: not-allowed;
  opacity: 0.5;
}
.plan-switch:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.plan-switch::after {
  content: "";
  position: absolute;
  inset: -8px -12px;
}
.plan-switch-thumb {
  display: block;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: var(--switch-thumb);
  pointer-events: none;
  transform: translateX(0);
  transition: transform 150ms var(--ease-out);
}
.plan-switch[data-size="sm"] .plan-switch-thumb {
  width: 12px;
  height: 12px;
}
.plan-switch[data-checked] .plan-switch-thumb,
.plan-switch[aria-checked="true"] .plan-switch-thumb,
.plan-switch-thumb[data-checked] {
  transform: translateX(calc(100% - 2px));
}

.settings-accordion {
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--control-solid);
  overflow: clip;
}
.settings-accordion-trigger .plan-chrome-contents { display: contents; }
.settings-accordion-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.85rem;
  width: 100%;
  margin: 0;
  padding: 0.9rem 1rem;
  border: 0;
  background: transparent;
  color: var(--ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.settings-accordion-trigger:hover {
  background: var(--accent-soft);
}
.settings-accordion-trigger:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.settings-accordion-trigger-copy {
  display: grid;
  gap: 0.2rem;
  min-width: 0;
}
.settings-accordion-trigger-copy strong {
  font-weight: 600;
}
.settings-accordion-trigger-copy span {
  color: var(--muted);
  font-size: 0.92rem;
  line-height: 1.45;
}
.settings-accordion-chevron {
  flex: 0 0 auto;
  width: 1.1rem;
  height: 1.1rem;
  color: var(--muted);
  transition: transform 200ms var(--ease-in-out);
}
.settings-accordion[data-open]:not([data-open="false"]) .settings-accordion-chevron {
  transform: rotate(180deg);
}
.settings-accordion-panel {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 200ms var(--ease-out);
}
.settings-accordion-panel[hidden] { display: grid !important; }
.settings-accordion[data-open]:not([data-open="false"]) .settings-accordion-panel {
  grid-template-rows: 1fr;
}
.settings-accordion-panel-inner {
  overflow: hidden;
  min-height: 0;
}
.settings-accordion-body {
  padding: 0 1rem 1rem;
  border-top: 1px solid transparent;
}
.settings-accordion[data-open]:not([data-open="false"]) .settings-accordion-body {
  border-top-color: var(--line);
  padding-top: 0.9rem;
}
@media (prefers-reduced-motion: reduce) {
  .settings-accordion-chevron,
  .settings-accordion-panel {
    transition: none;
  }
}

.diffs-theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(11.5rem, 1fr));
  gap: 0.65rem;
}
.diffs-theme-option {
  display: grid;
  gap: 0.55rem;
  width: 100%;
  margin: 0;
  padding: 0.7rem;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--paper);
  color: var(--ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 150ms ease, background-color 150ms ease, transform 160ms var(--ease-out);
}
.diffs-theme-option:hover {
  border-color: var(--accent-hover-border);
}
.diffs-theme-option:active {
  transform: scale(0.97);
}
.diffs-theme-option[aria-checked="true"] {
  border-color: var(--accent);
  background: var(--accent-soft);
  box-shadow: none;
}
.diffs-theme-option:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.diffs-theme-samples {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.35rem;
}
.diffs-theme-sample {
  display: grid;
  gap: 0.22rem;
  padding: 0.45rem 0.5rem;
  border-radius: 8px;
  background: var(--sample-bg, #fff);
  color: var(--sample-fg, #0a0a0a);
  font-family: var(--font-mono);
  font-size: 0.62rem;
  line-height: 1.35;
  min-height: 3.4rem;
}
.diffs-theme-sample span {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: clip;
}
.diffs-theme-sample .tok-comment { color: var(--sample-comment); }
.diffs-theme-sample .tok-keyword { color: var(--sample-keyword); }
.diffs-theme-sample .tok-string { color: var(--sample-string); }
.diffs-theme-sample .tok-fn { color: var(--sample-function); }
.diffs-theme-sample .tok-added { color: var(--sample-added); }
.diffs-theme-sample .tok-deleted { color: var(--sample-deleted); }
.diffs-theme-option-meta {
  display: grid;
  gap: 0.15rem;
}
.diffs-theme-option-meta strong {
  font-size: 0.92rem;
  font-weight: 600;
}
.diffs-theme-option-meta span {
  color: var(--muted);
  font-size: 0.78rem;
  line-height: 1.35;
}
`
