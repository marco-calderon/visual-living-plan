import type { ClientAssets } from './assets'
import type { ExecutionState } from './execution'
import { planSourceFlags, renderPlanStaticHtml } from './planMdx/source'
import type { PlanSnapshotRecord } from './planSnapshots'
import type { PlanMode } from './processRecord'
import { clientLogScript } from './clientLog'
import { faviconLink } from './favicon'
import { PROCESSES_PANEL_STYLES, processesPanelMarkup, processesPanelScript } from './processesPanel'
import { accentCssCustomProperties } from './theme'
import {
  DEFAULT_DIFFS_THEME,
  diffsThemePreset,
  type DiffsThemePreset,
} from './diffsTheme'
import type {
  InteractionResponse,
  PlanComment,
  PlanDocument,
  ReviewDecision,
  ReviewResult,
  SectionDiff,
} from './types'
import { planToExpectedGraph, withPlannedWorkflow } from './workflow'
import { changelogSectionHtml, type ChangelogRelease } from './changelog'

export type RenderTheme = {
  accent: string
  fullWidth?: boolean
  diffsTheme?: string
  diffsThemes?: DiffsThemePreset[]
  configPath: string
  presets: Array<{ id: string; label: string; accent: string }>
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function diffsThemeSampleMarkup(
  sample: DiffsThemePreset['lightSample'],
  mode: 'Light' | 'Dark',
): string {
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


const THEME_BOOTSTRAP = `
(() => {
  const apply = () => {
    document.documentElement.dataset.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  };
  apply();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', apply);
})();
`

function accentStyleTag(accent: string): string {
  return `<style id="living-plan-accent-vars">${accentCssCustomProperties(accent)}</style>`
}

const STYLES = `
:root {
  color-scheme: light;
  --brand-coral: #ff5a36;
  --brand-magenta: #e83e8c;
  --brand-blue: #2563eb;
  --brand-blue-deep: #1d4ed8;
  --brand-blue-700: #1e40af;
  --brand-cyan: #67e8f9;
  --brand-blue-200: #dbeafe;
  --brand-purple: #7c3aed;
  --canvas: #ffffff;
  --surface: #f4f4f5;
  --surface-soft: #fafafa;
  --hairline: #e4e4e7;
  --hairline-soft: #f0f0f1;
  --ink: #18181b;
  --ink-strong: #000000;
  --charcoal: #27272a;
  --slate: #3f3f46;
  --steel: #71717a;
  --stone: #a1a1aa;
  --primary: #09090b;
  --on-primary: #ffffff;
  --paper: var(--canvas);
  --paper-2: var(--surface-soft);
  --page-top: var(--canvas);
  --panel: var(--surface);
  --panel-strong: #ffffff;
  --line: var(--hairline);
  --muted: var(--steel);
  --accent: var(--brand-blue-deep);
  --accent-2: var(--brand-coral);
  --danger: #d45656;
  --ok: #166534;
  --on-accent: var(--on-primary);
  --shadow: 0 4px 6px rgba(0, 0, 0, 0.08);
  --shadow-modal: 0 12px 16px -4px rgba(36, 36, 36, 0.08);
  --radius: 16px;
  --space-xxs: 4px;
  --space-xs: 8px;
  --space-sm: 12px;
  --space-md: 16px;
  --space-lg: 20px;
  --space-xl: 24px;
  --space-xxl: 32px;
  --space-xxxl: 40px;
  --space-section-sm: 48px;
  --space-section: 64px;
  --space-section-lg: 80px;
  --space-hero: 96px;
  --font-display: "DM Sans", Inter, "Helvetica Neue", Helvetica, Arial, sans-serif;
  --font-body: "DM Sans", Inter, "Helvetica Neue", Helvetica, Arial, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --wash-accent: var(--brand-blue-200);
  --wash-warm: #f4f4f5;
  --chip-bg: var(--surface);
  --tabs-bg: var(--surface);
  --control-bg: var(--canvas);
  --control-solid: var(--canvas);
  --code-inline-bg: var(--brand-blue-200);
  --code-block-bg: #18181b;
  --code-block-fg: #fafafa;
  --tab-active-bg: var(--primary);
  --tab-active-fg: var(--on-primary);
  --toast-bg: var(--primary);
  --toast-fg: var(--on-primary);
  --accent-soft: var(--brand-blue-200);
  --accent-border: #bfdbfe;
  --accent-hover-border: var(--brand-blue);
  --accent-hover-shadow: none;
  --danger-soft: #fef2f2;
  --danger-border: #d45656;
  --focus: var(--brand-blue-deep);
  --pulse: rgba(29, 78, 216, 0.35);
  --stage-bg: var(--canvas);
  --dot: var(--hairline);
  --node-bg: var(--surface);
  --node-shadow: none;
  --node-active-border: var(--brand-blue-deep);
  --node-active-ring: var(--brand-blue-200);
  --node-done-border: #166534;
  --node-failed-border: #d45656;
  --node-blocked-border: var(--brand-coral);
  --handle-border: #ffffff;
  --minimap-idle: #a1a1aa;
  --titlebar-offset: 3.75rem;
}

:root[data-theme="dark"] {
  color-scheme: dark;
  --canvas: #0c0c0e;
  --surface: #18181b;
  --surface-soft: #141416;
  --hairline: #27272a;
  --hairline-soft: #1f1f23;
  --ink: #fafafa;
  --ink-strong: #ffffff;
  --charcoal: #e4e4e7;
  --slate: #d4d4d8;
  --steel: #a1a1aa;
  --stone: #71717a;
  --primary: #fafafa;
  --on-primary: #0c0c0e;
  --paper: var(--canvas);
  --paper-2: #101012;
  --page-top: var(--canvas);
  --panel: var(--surface);
  --panel-strong: #27272a;
  --line: var(--hairline);
  --muted: var(--steel);
  --accent: #93c5fd;
  --accent-2: #fdba74;
  --danger: #fca5a5;
  --ok: #86efac;
  --on-accent: #0c0c0e;
  --shadow: 0 4px 6px rgba(0, 0, 0, 0.28);
  --shadow-modal: 0 12px 16px -4px rgba(0, 0, 0, 0.45);
  --wash-accent: rgba(147, 197, 253, 0.14);
  --wash-warm: #18181b;
  --chip-bg: var(--surface);
  --tabs-bg: var(--surface);
  --control-bg: var(--canvas);
  --control-solid: var(--canvas);
  --code-inline-bg: rgba(147, 197, 253, 0.16);
  --code-block-bg: #09090b;
  --code-block-fg: #fafafa;
  --tab-active-bg: var(--primary);
  --tab-active-fg: var(--on-primary);
  --toast-bg: var(--primary);
  --toast-fg: var(--on-primary);
  --accent-soft: rgba(147, 197, 253, 0.14);
  --accent-border: #27272a;
  --accent-hover-border: #93c5fd;
  --accent-hover-shadow: none;
  --danger-soft: rgba(252, 165, 165, 0.12);
  --danger-border: #fca5a5;
  --focus: #93c5fd;
  --pulse: rgba(147, 197, 253, 0.4);
  --stage-bg: var(--canvas);
  --dot: var(--hairline);
  --node-bg: var(--surface);
  --node-shadow: none;
  --node-active-border: #93c5fd;
  --node-active-ring: rgba(147, 197, 253, 0.2);
  --node-done-border: #86efac;
  --node-failed-border: #fca5a5;
  --node-blocked-border: #fdba74;
  --handle-border: #18181b;
  --minimap-idle: #71717a;
  --review-bg: #18181b;
  --titlebar-offset: 3.75rem;
}

* { box-sizing: border-box; }
html {
  margin: 0;
  min-height: 100%;
  max-width: 100%;
  overflow-x: clip;
}
body {
  margin: 0;
  min-height: 100%;
  max-width: 100%;
  overflow-x: clip;
  color: var(--charcoal);
  font-family: var(--font-body);
  font-size: 16px;
  line-height: 1.5;
  background-color: var(--canvas);
  background-image: none;
}

.shell {
  --shell-width: min(720px, calc(100% - 2rem));
  width: var(--shell-width);
  max-width: 100%;
  min-width: 0;
  margin: 0 auto;
  padding: calc(var(--titlebar-offset) + 1.35rem) 0 7rem;
  position: relative;
  z-index: 1;
  overflow-x: clip;
}
:root[data-layout="full"] .shell,
body.layout-full .shell {
  --shell-width: calc(100% - 2rem);
}
body.has-review-bar .shell {
  padding-bottom: 14rem;
}
.stack,
.tab-panel,
.settings-stack,
.block,
.phase,
.phase-body,
.rich,
.execution-shell,
.execution-banner,
.execution-stage {
  min-width: 0;
  max-width: 100%;
}

.titlebar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 8;
  display: flex;
  align-items: center;
  gap: 0.85rem;
  height: var(--titlebar-offset);
  padding: 0 1rem;
  background: var(--surface);
  border-bottom: 1px solid var(--hairline);
}
.plan-details {
  position: relative;
  flex: 0 0 auto;
  align-self: stretch;
  display: flex;
  align-items: center;
  pointer-events: none;
}
.logo-btn,
.plan-card,
.chrome-tools,
.chrome-tools > * { pointer-events: auto; }
.logo-btn {
  position: relative;
  width: 36px;
  height: 36px;
  padding: 0;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
}
.logo-btn[aria-expanded="true"] {
  box-shadow: 0 0 0 3px var(--pulse);
}
.logo-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
.titlebar-logo {
  width: 29px;
  height: 29px;
  display: block;
  border-radius: 50%;
}
.logo-badge {
  position: absolute;
  top: -0.15rem;
  right: -0.35rem;
  min-width: 1.05rem;
  height: 1.05rem;
  padding: 0 0.28rem;
  border-radius: 999px;
  background: var(--accent-2);
  color: #14201b;
  font-size: 0.68rem;
  font-weight: 700;
  line-height: 1.05rem;
  text-align: center;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}
.logo-badge[hidden] { display: none !important; }
.plan-card {
  position: absolute;
  z-index: 9;
  top: calc(100% + 0.55rem);
  left: 0;
  width: min(29rem, calc(100vw - 2rem));
  padding: 1rem 1.1rem 0.95rem;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--panel-strong);
  box-shadow: var(--shadow);
  transform-origin: top left;
}
.plan-card[hidden] { display: none !important; }
.plan-card[data-open] {
  animation: processes-panel-in 280ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
.plan-card[data-closed] {
  animation: processes-panel-out 240ms ease both;
}
@media (prefers-reduced-motion: reduce) {
  .plan-card[data-open],
  .plan-card[data-closed] { animation: none; }
}
.plan-card .lede {
  margin-top: 0;
  max-width: none;
  font-size: 0.95rem;
  line-height: 1.5;
}
.plan-card > .facts:first-child { margin-top: 0; }
.chrome-tools {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.65rem;
}
.facts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.95rem;
}
.fact {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  height: 1.75rem;
  padding: 0 0.55rem 0 0.45rem;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--chip-bg);
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 500;
  white-space: nowrap;
}
.fact.solo {
  width: 1.75rem;
  padding: 0;
}
.fact .val {
  color: var(--ink);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.fact svg {
  width: 15px;
  height: 15px;
  display: block;
  flex: 0 0 auto;
}
.fact svg[data-mode-icon],
.fact svg[data-review-icon] { display: none; }
.fact[data-mode="watch"] svg[data-mode-icon="watch"],
.fact[data-mode="review"] svg[data-mode-icon="review"],
.fact[data-mode="comment"] svg[data-mode-icon="comment"],
.fact[data-decision="approve"] svg[data-review-icon="approve"],
.fact[data-decision="deny"] svg[data-review-icon="deny"],
.fact[data-decision="iterate"] svg[data-review-icon="iterate"] { display: block; }
.fact[hidden] { display: none !important; }
.fact[data-mode="watch"],
.fact[data-mode="review"],
.fact[data-workflow="live"] {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: var(--accent-border);
}
.fact[data-mode="comment"],
.fact[data-decision="iterate"] {
  color: var(--accent-2);
  background: var(--wash-warm);
}
.fact[data-decision="approve"] {
  color: var(--ok);
  background: color-mix(in srgb, var(--ok) 14%, transparent);
  border-color: color-mix(in srgb, var(--ok) 40%, transparent);
}
.fact[data-decision="deny"] {
  color: var(--danger);
  background: var(--danger-soft);
  border-color: var(--danger-border);
}
.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.brand {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 20px;
  line-height: 1.4;
  letter-spacing: 0;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lede {
  max-width: 38rem;
  color: var(--muted);
  font-size: 1.05rem;
  line-height: 1.55;
  margin: 0;
}

.meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 1.1rem;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.7rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--chip-bg);
  color: var(--muted);
  font-size: 0.82rem;
}

.chip strong { color: var(--ink); font-weight: 600; }
.live-dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 0 var(--pulse);
  animation: pulse 1.8s ease infinite;
}

.settings-stack {
  display: grid;
  gap: 1rem;
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
.release-cards {
  display: grid;
  gap: 0.7rem;
}
.release-card {
  display: grid;
  grid-template-columns: 8.5rem minmax(0, 1fr);
  column-gap: 0.9rem;
  align-items: start;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--control-solid);
  padding: 0.95rem 1rem 1rem;
  min-width: 0;
}
.release-stat { display: grid; align-content: start; gap: 0.15rem; }
.release-card .settings-kicker { margin: 0; }
.release-count {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 2.6rem;
  letter-spacing: -0.04em;
  line-height: 0.95;
}
.release-card[data-empty="true"] .release-count { color: var(--muted); }
.release-card[data-kind="bugs"]:not([data-empty="true"]) .release-count { color: var(--danger); }
.release-card[data-kind="improvements"]:not([data-empty="true"]) .release-count { color: var(--accent-2); }
.release-card[data-kind="features"]:not([data-empty="true"]) .release-count { color: var(--ok); }
.release-card[data-kind="changes"] .release-count { color: var(--accent); }
.release-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.65rem;
}
.release-list li {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.45rem 0.5rem;
  align-items: start;
  font-size: 0.92rem;
  line-height: 1.45;
}
.release-list .ver {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 500;
  line-height: 1.2;
  color: var(--accent);
  background: var(--accent-soft);
  border-radius: 999px;
  padding: 0.16rem 0.42rem;
  margin-top: 0.15rem;
  white-space: nowrap;
}
.release-empty {
  margin: 0.15rem 0 0;
  color: var(--muted);
  font-size: 0.92rem;
  line-height: 1.45;
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
.settings-toggle {
  display: flex;
  align-items: flex-start;
  gap: 0.85rem;
  margin: 0 0 0.85rem;
  padding: 0.85rem 1rem;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--control-solid);
  cursor: pointer;
  color: var(--ink);
}
.settings-toggle:hover {
  border-color: var(--accent-hover-border);
}
.settings-toggle:focus-within {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.settings-toggle input {
  margin: 0.2rem 0 0;
  width: 1.1rem;
  height: 1.1rem;
  flex: 0 0 auto;
  accent-color: var(--accent);
}
.settings-toggle-copy {
  display: grid;
  gap: 0.25rem;
  min-width: 0;
}
.settings-toggle-copy strong {
  font-weight: 600;
}
.settings-toggle-copy span {
  color: var(--muted);
  font-size: 0.92rem;
  line-height: 1.45;
}

.settings-accordion {
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--control-solid);
  overflow: clip;
}
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
  transition: transform 0.4s ease;
}
.settings-accordion[data-open="true"] .settings-accordion-chevron {
  transform: rotate(180deg);
}
.settings-accordion-panel {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.4s ease;
}
.settings-accordion[data-open="true"] .settings-accordion-panel {
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
.settings-accordion[data-open="true"] .settings-accordion-body {
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
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}
.diffs-theme-option:hover {
  border-color: var(--accent-hover-border);
  box-shadow: var(--accent-hover-shadow);
  transform: translateY(-1px);
}
.diffs-theme-option[aria-checked="true"] {
  border-color: var(--accent);
  background: var(--accent-soft);
  box-shadow: none;
  transform: none;
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

.stack { display: grid; gap: 1rem; }

.tabs {
  display: inline-flex;
  flex: 0 0 auto;
  gap: 0.15rem;
  padding: 0.18rem;
  margin: 0;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--tabs-bg);
}
.tab-btn {
  display: grid;
  place-items: center;
  width: 1.75rem;
  height: 1.75rem;
  border: 0;
  background: transparent;
  color: var(--muted);
  border-radius: 999px;
  padding: 0;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.tab-btn svg {
  width: 16px;
  height: 16px;
  display: block;
}
.tab-btn[aria-selected="true"] {
  background: var(--tab-active-bg);
  color: var(--tab-active-fg);
}
.tab-btn:focus-visible,
.btn:focus-visible,
.choice-option:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.tab-panel[hidden] { display: none !important; }
.lock-banner {
  margin-bottom: 0.85rem;
  padding: 0.8rem 1rem;
  border-radius: 14px;
  border: 1px solid var(--accent-border);
  background: var(--accent-soft);
  color: var(--ink);
  font-size: 0.95rem;
}
.plan-locked .interaction { opacity: 0.78; }

.block {
  scroll-margin: 1.25rem;
  scroll-margin-top: calc(var(--titlebar-offset) + 0.75rem);
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: 16px;
  padding: var(--space-xl);
  box-shadow: none;
  animation: rise 0.55s ease both;
}
.plan-document > :is(.plan-entry, .block, .plan-panel, .vlp-workflow, .vlp-stack, .vlp-row, .vlp-box, .vlp-chart),
.plan-document > div:has(> .plan-entry) {
  margin-top: var(--space-xl);
}
.plan-document > :first-child,
.plan-document > div:first-child:has(> .plan-entry) {
  margin-top: 0;
}
.plan-rich > :is(.plan-entry, .plan-panel, .vlp-stack, .vlp-row, .vlp-box, .vlp-chart),
.plan-rich > div:has(> .plan-entry) {
  margin-top: var(--space-xl);
}
.plan-rich > :is(.plan-entry, .plan-panel, .vlp-stack, .vlp-row, .vlp-box, .vlp-chart):not(:last-child),
.plan-rich > div:has(> .plan-entry):not(:last-child) {
  margin-bottom: var(--space-xl);
}
.vlp-stack,
.vlp-box {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}
.vlp-row { gap: var(--space-xl); }
body.plan-live .block {
  animation: none;
}
body.plan-live .block.change-applied {
  animation: change-applied 1.15s ease;
}

.block.diff-added { box-shadow: inset 3px 0 0 var(--ok); }
.block.diff-edited { box-shadow: inset 3px 0 0 var(--accent-2); }
.block.plan-ref-focus {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
  background: var(--accent-soft);
}

.workflow h3 {
  margin: 0 0 0.45rem;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 1.35rem;
}
.workflow-note {
  margin: 0 0 0.85rem;
  color: var(--muted);
  line-height: 1.5;
}
.workflow-steps {
  list-style: none;
  padding: 0;
  margin: 0 0 0.9rem;
  display: grid;
  gap: 0.45rem;
}
.workflow-step {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.8rem;
  align-items: baseline;
  text-align: left;
  border: 1px solid var(--line);
  background: var(--control-solid);
  color: var(--ink);
  border-radius: 12px;
  padding: 0.7rem 0.85rem;
  font: inherit;
  cursor: pointer;
  text-decoration: none;
}
.workflow-step:hover {
  border-color: var(--accent-hover-border);
}
.workflow-step-label { font-weight: 600; }
.workflow-step-ref {
  color: var(--accent);
  font-size: 0.82rem;
  font-weight: 600;
  white-space: nowrap;
}

.rich :is(h1,h2,h3) {
  font-family: var(--font-display);
  font-weight: 600;
  letter-spacing: -0.02em;
  margin: 0 0 0.55rem;
}
.rich p, .rich li { line-height: 1.55; color: var(--ink); overflow-wrap: anywhere; }
.rich p { margin: 0 0 0.75rem; }
.rich ul, .rich ol { margin: 0 0 0.75rem; padding-left: 1.2rem; }
.rich {
  overflow-wrap: anywhere;
  word-break: break-word;
}
.rich-table {
  margin: 0 0 0.85rem;
  max-width: 100%;
  overflow-x: auto;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--panel-strong);
}
.rich-table table {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  margin: 0;
}
.rich-table th,
.rich-table td {
  padding: 0.5rem 0.75rem;
  text-align: left;
  vertical-align: top;
  line-height: 1.45;
  color: var(--ink);
  border-bottom: 1px solid var(--line);
}
.rich-table th {
  font-weight: 600;
  background: var(--surface-soft);
}
.rich-table tr:last-child :is(th, td) { border-bottom: 0; }
.rich-table .align-center { text-align: center; }
.rich-table .align-right { text-align: right; }
.rich > .rich-table:last-child { margin-bottom: 0; }
.rich code, .code-block code {
  font-family: var(--font-mono);
}
.rich :not(pre) > code {
  font-size: 0.9em;
  background: var(--code-inline-bg);
  padding: 0.1rem 0.35rem;
  border-radius: 0.35rem;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.code-block code {
  font-size: 0.9em;
}
.code-block {
  margin: 0 0 0.85rem;
  max-width: 100%;
  overflow: auto;
  padding: 0.9rem 1rem;
  border-radius: 12px;
  background: var(--code-block-bg);
  color: var(--code-block-fg);
}
.code-host {
  margin: 0 0 0.85rem;
  max-width: 100%;
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
}
.plan-code {
  display: block;
  max-width: 100%;
  overflow-x: auto;
}
.rich > .code-host:last-child,
.rich > .code-block:last-child {
  margin-bottom: 0;
}
.mermaid-diagram {
  position: relative;
  display: flex;
  flex-direction: column;
  margin: 0 0 0.85rem;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--panel-strong);
  overflow: hidden;
  --pele-bg: var(--paper);
  --pele-fg: var(--ink);
  --pele-muted: var(--muted);
  --pele-line: var(--accent);
  --pele-surface: color-mix(in srgb, var(--accent) 14%, var(--paper));
  --pele-surface-alt: color-mix(in srgb, var(--accent) 8%, var(--paper-2));
  --pele-border: var(--accent);
  --pele-accent: var(--accent);
  --pele-critical: var(--danger);
  --pele-error: var(--danger);
  --pele-font: var(--font-body);
  --pele-font-mono: var(--font-mono);
  --pele-radius: 8px;
  --pele-series-1: var(--accent);
  --pele-series-2: var(--accent-2);
  --pele-series-3: var(--ok);
  --pele-series-4: var(--danger);
  --pele-series-5: color-mix(in srgb, var(--accent) 62%, var(--accent-2));
  --pele-series-6: color-mix(in srgb, var(--accent-2) 68%, var(--ink));
  --pele-series-7: color-mix(in srgb, var(--accent) 48%, var(--danger));
  --pele-series-8: color-mix(in srgb, var(--ok) 55%, var(--accent));
}
:root[data-theme="dark"] .mermaid-diagram {
  --pele-surface: color-mix(in srgb, var(--accent) 22%, var(--paper));
  --pele-surface-alt: color-mix(in srgb, var(--accent) 12%, var(--paper-2));
  --pele-line: color-mix(in srgb, var(--accent) 78%, var(--ink));
  --pele-border: color-mix(in srgb, var(--accent) 72%, var(--ink));
}
.mermaid-diagram .mermaid {
  margin: 0;
  padding: 0.85rem 1rem;
  white-space: pre-wrap;
  color: var(--muted);
}
.mermaid-stage {
  overflow: hidden;
  min-height: 10rem;
  cursor: grab;
  user-select: none;
}
.mermaid-stage:active { cursor: grabbing; }
.mermaid-stage:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.mermaid-stage > svg {
  display: block;
  width: 100%;
  height: 100%;
  max-width: none;
}
.pele-edge-hit {
  pointer-events: stroke;
}
.mermaid-controls {
  display: flex;
  justify-content: flex-end;
  gap: 0.35rem;
  padding: 0.45rem 0.55rem;
  border-bottom: 1px solid var(--line);
}
.mermaid-control {
  display: grid;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--control-bg);
  color: var(--ink);
  cursor: pointer;
}
.mermaid-control svg {
  width: 1rem;
  height: 1rem;
}
.mermaid-control:hover {
  border-color: var(--accent-hover-border);
}
.mermaid-control:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.mermaid-control[aria-pressed="true"] {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}
.mermaid-placeholder { margin: 0 0 0.85rem; }
body.mermaid-maximized { overflow: hidden; }
.mermaid-diagram.is-maximized {
  position: fixed;
  z-index: 20;
  inset: 0;
  margin: 0;
  border: 0;
  border-radius: 0;
  background: var(--paper);
}
.mermaid-diagram.is-maximized .mermaid-stage {
  flex: 1 1 auto;
  min-height: 0;
  height: auto;
}
.mermaid-error {
  margin: 0.65rem 0 0;
  color: var(--danger);
  font-size: 0.85rem;
}

.phase { display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 0.9rem; }
.phase-rail {
  width: 4px;
  margin: 0.2rem auto;
  border-radius: 999px;
  background: var(--line);
  position: relative;
}
.phase.status-active .phase-rail {
  background: var(--accent);
  animation: glow 1.6s ease infinite;
}
.phase.status-done .phase-rail { background: var(--ok); }
.phase.status-failed .phase-rail,
.phase.status-blocked .phase-rail { background: var(--danger); }
.phase-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem 0.8rem;
  align-items: baseline;
  margin-bottom: 0.35rem;
}
.phase-meta h3 {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 1.25rem;
}
.phase-status {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--muted);
}
.status-chip {
  display: inline-block;
  margin: 0 0.15rem;
  padding: 0.05rem 0.4rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 0.68rem;
  font-weight: 600;
  vertical-align: 0.05em;
}
.status-chip.status-active { color: var(--accent); }
.status-chip.status-done { color: var(--ok); }
.status-chip.status-blocked,
.status-chip.status-failed { color: var(--danger); }

.callout-label {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.72rem;
  font-weight: 700;
  margin-bottom: 0.45rem;
  color: var(--accent);
}
.callout.kind-risk .callout-label,
.callout.kind-warning .callout-label { color: var(--danger); }
.callout.kind-decision .callout-label { color: var(--accent-2); }

.interaction-kicker {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--accent-2);
  margin-bottom: 0.35rem;
}
.interaction h3 {
  margin: 0 0 0.8rem;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 1.35rem;
}
.choice-grid {
  display: grid;
  gap: 0.7rem;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}
.choice-option {
  text-align: left;
  border: 1px solid var(--line);
  background: var(--control-solid);
  color: var(--ink);
  border-radius: 9999px;
  padding: 11px 24px;
  cursor: pointer;
}
.choice-option:hover:not(:disabled) {
  border-color: var(--ink);
}
.choice-option.selected {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.choice-label { display: block; font-weight: 600; margin-bottom: 0.25rem; }
.choice-desc { display: block; color: var(--muted); font-size: 0.92rem; line-height: 1.4; }

.field {
  display: grid;
  gap: 0.35rem;
  margin-bottom: 0.8rem;
}
.field span { font-size: 0.92rem; color: var(--muted); }
input, textarea, select {
  width: 100%;
  border: 1px solid var(--hairline);
  border-radius: 8px;
  min-height: 40px;
  padding: 0.55rem 0.8rem;
  background: var(--canvas);
  color: var(--ink);
  font: inherit;
}
input:focus, textarea:focus, select:focus {
  outline: 2px solid var(--focus);
  border-color: var(--focus);
}
textarea { min-height: 88px; resize: vertical; }

.button-row { display: flex; gap: 0.6rem; flex-wrap: wrap; }
.btn {
  border: 1px solid var(--hairline);
  background: var(--canvas);
  color: var(--ink);
  border-radius: 9999px;
  padding: 11px 24px;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
  cursor: pointer;
}
.btn:hover:not(:disabled) { background: var(--surface); }
.btn:disabled { opacity: 0.55; cursor: default; }
.btn.primary,
.btn.primary:hover:not(:disabled) { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
.btn.secondary { background: transparent; border-color: var(--ink); color: var(--ink); }
.btn.danger { background: var(--danger-soft); border-color: var(--danger-border); color: var(--danger); }

.interaction-state {
  margin-top: 0.85rem;
  color: var(--muted);
  font-size: 0.9rem;
}

.checklist ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.45rem; }
.checklist li {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  padding: 0.55rem 0.7rem;
  border-radius: 12px;
  background: var(--surface-soft);
  border: 1px solid var(--line);
}
.checklist .check {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  min-width: 2.4rem;
}
.checklist li.done { opacity: 0.72; }
.checklist li.done .check { color: var(--ok); }

.review-dock[hidden],
.chip[hidden] { display: none; }
.review-dock {
  position: fixed;
  inset-inline: 0;
  bottom: 0;
  z-index: 5;
  display: flex;
  justify-content: flex-start;
  align-items: flex-end;
  padding: 1rem;
  pointer-events: none;
  background: none;
  animation: rise 0.5s ease both;
}
.review-bar {
  pointer-events: auto;
  width: auto;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.35rem;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ink);
  box-shadow: var(--shadow-modal);
}
.review-bar:focus-within {
  border-color: var(--accent-hover-border);
  box-shadow: 0 0 0 3px var(--accent-soft), var(--shadow-modal);
}
.review-bar .actions {
  display: flex;
  gap: 0.45rem;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
}
.review-bar .actions .btn { flex: 0 0 auto; }
.review-note {
  display: block;
  width: 100%;
  min-width: 0;
  margin: 0;
  border: 0;
  border-radius: 12px;
  background: transparent;
  box-shadow: none;
  resize: none;
  overflow-y: auto;
  min-height: 2.75rem;
  max-height: 9rem;
  padding: 0.35rem 0.45rem 0.15rem;
  line-height: 1.45;
  font: inherit;
}
.review-note:focus { outline: none; }
.review-note::placeholder { color: var(--muted); }
:root[data-theme="dark"] .review-bar {
  background: transparent;
  border-color: transparent;
}

.toast {
  position: fixed;
  top: calc(var(--titlebar-offset) + 0.75rem);
  left: 1rem;
  background: var(--toast-bg);
  color: var(--toast-fg);
  padding: 0.7rem 0.9rem;
  border-radius: 12px;
  opacity: 0;
  transform: translateY(-8px);
  transition: opacity 0.2s ease, transform 0.2s ease;
  z-index: 6;
}
.toast.show { opacity: 1; transform: translateY(0); }

@keyframes rise {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes change-applied {
  0% { background-color: var(--wash-accent); }
  100% { background-color: var(--panel); }
}
@keyframes pulse {
  0% { box-shadow: 0 0 0 0 var(--pulse); }
  70% { box-shadow: 0 0 0 10px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}

.execution-empty {
  display: grid;
  place-items: center;
  min-height: 58vh;
  padding: 2rem;
  text-align: center;
  color: var(--muted);
  line-height: 1.55;
}
@keyframes glow {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}

@media (max-width: 720px) {
  .review-dock { padding-inline: 0.75rem; }
  .review-bar { border-radius: 18px; }
  body.has-review-bar .shell { padding-bottom: 16rem; }
}
@media (prefers-reduced-motion: reduce) {
  body.plan-live .block.change-applied { animation: none; }
}
`

function clientScript(
  mode: PlanMode,
  executionActive: boolean,
  theme: RenderTheme,
  basePath: string,
): string {
  return `
(() => {
  let mode = ${JSON.stringify(mode)};
  const apiBase = ${JSON.stringify(basePath)};
  const interactionsLocked = ${JSON.stringify(executionActive)};
  let currentAccent = ${JSON.stringify(theme.accent)};
  const toast = document.getElementById('toast');
  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1600);
  }

  const planDetails = document.querySelector('[data-plan-details]');
  const planDetailsBtn = document.querySelector('[data-plan-details-toggle]');
  const planCard = document.querySelector('[data-plan-card]');
  let planDetailsOpen = false;
  let planDetailsCloseTimer = 0;
  let planDetailsCloseListener = null;
  function planDetailsMotionReduced() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function cancelPlanDetailsClose() {
    window.clearTimeout(planDetailsCloseTimer);
    planDetailsCloseTimer = 0;
    if (planDetailsCloseListener && planCard) {
      planCard.removeEventListener('animationend', planDetailsCloseListener);
      planDetailsCloseListener = null;
    }
  }
  function finishPlanDetailsClose() {
    cancelPlanDetailsClose();
    if (planDetailsOpen || !planCard) return;
    planCard.hidden = true;
  }
  function setPlanDetails(open) {
    if (!planDetailsBtn || !planCard || open === planDetailsOpen) return;
    planDetailsOpen = open;
    planDetailsBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    cancelPlanDetailsClose();
    if (open) {
      planCard.hidden = false;
      planCard.removeAttribute('data-closed');
      planCard.removeAttribute('data-open');
      if (!planDetailsMotionReduced()) void planCard.getBoundingClientRect();
      planCard.setAttribute('data-open', '');
      return;
    }
    planCard.removeAttribute('data-open');
    planCard.setAttribute('data-closed', '');
    if (planDetailsMotionReduced()) {
      finishPlanDetailsClose();
      return;
    }
    planDetailsCloseListener = (event) => {
      if (event.target !== planCard) return;
      finishPlanDetailsClose();
    };
    planCard.addEventListener('animationend', planDetailsCloseListener);
    planDetailsCloseTimer = window.setTimeout(finishPlanDetailsClose, 320);
  }
  if (planDetails && planDetailsBtn && planCard) {
    planDetailsBtn.addEventListener('click', () => {
      setPlanDetails(!planDetailsOpen);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') setPlanDetails(false);
    });
    document.addEventListener('click', (event) => {
      if (!planDetailsOpen) return;
      if (event.target instanceof Node && planDetails.contains(event.target)) return;
      setPlanDetails(false);
    });
  }

  function syncPending(text) {
    const count = Math.max(0, Number(text) || 0);
    const label = 'Pending · ' + count;
    document.querySelectorAll('[data-pending-count]').forEach((node) => {
      node.textContent = String(count);
    });
    const fact = document.querySelector('[data-pending-fact]');
    if (fact) {
      fact.hidden = count <= 0;
      fact.setAttribute('aria-label', label);
      fact.setAttribute('title', label);
    }
    const badge = document.querySelector('[data-pending-badge]');
    if (badge) {
      badge.hidden = count <= 0;
      badge.textContent = String(count);
    }
    if (planDetailsBtn) {
      planDetailsBtn.setAttribute('aria-label', count > 0 ? 'Plan details, ' + count + ' pending' : 'Plan details');
    }
  }

  function setModeChip(next) {
    const chip = document.querySelector('[data-plan-mode-chip]');
    if (!chip) return;
    const label = 'Mode · ' + next;
    chip.setAttribute('data-mode', next);
    chip.setAttribute('aria-label', label);
    chip.setAttribute('title', label);
    const value = chip.querySelector('[data-plan-mode-value]');
    if (value) value.textContent = next;
  }

  function setReview(decision) {
    const reviewChip = document.querySelector('[data-review-chip]');
    const reviewValue = document.querySelector('[data-review-value]');
    if (!reviewChip) return;
    reviewChip.hidden = !decision;
    if (!decision) return;
    const label = 'Review · ' + decision;
    reviewChip.setAttribute('data-decision', decision);
    reviewChip.setAttribute('aria-label', label);
    reviewChip.setAttribute('title', label);
    if (reviewValue) reviewValue.textContent = decision;
  }

  function ensureAccentStyle() {
    let style = document.getElementById('living-plan-accent-vars');
    if (!style) {
      style = document.createElement('style');
      style.id = 'living-plan-accent-vars';
      document.head.appendChild(style);
    }
    return style;
  }

  let currentFullWidth = ${JSON.stringify(Boolean(theme.fullWidth))};
  let currentDiffsTheme = ${JSON.stringify(theme.diffsTheme || DEFAULT_DIFFS_THEME)};

  function applyLayout(fullWidth) {
    currentFullWidth = Boolean(fullWidth);
    document.documentElement.dataset.layout = currentFullWidth ? 'full' : 'centered';
    document.body.classList.toggle('layout-full', currentFullWidth);
    const toggle = document.getElementById('layout-full-width');
    if (toggle && 'checked' in toggle) toggle.checked = currentFullWidth;
  }

  function applyDiffsTheme(diffsTheme, label) {
    currentDiffsTheme = diffsTheme || ${JSON.stringify(DEFAULT_DIFFS_THEME)};
    document.documentElement.dataset.diffsTheme = currentDiffsTheme;
    document.querySelectorAll('[data-diffs-theme]').forEach((node) => {
      const id = node.getAttribute('data-diffs-theme');
      node.setAttribute('aria-checked', id === currentDiffsTheme ? 'true' : 'false');
    });
    const currentLabel = document.getElementById('diffs-theme-current');
    if (currentLabel) {
      currentLabel.textContent = label || currentLabel.textContent || currentDiffsTheme;
    }
  }

  function applyTheme(payload) {
    if (!payload) return;
    if (payload.accent) {
      currentAccent = payload.accent;
      document.documentElement.dataset.accent = payload.accent;
      if (payload.css) ensureAccentStyle().textContent = payload.css;
      document.querySelectorAll('[data-accent-swatch]').forEach((node) => {
        const swatch = node.getAttribute('data-accent-swatch');
        node.setAttribute('aria-checked', swatch === payload.accent ? 'true' : 'false');
      });
      const colorInput = document.getElementById('theme-accent-picker');
      if (colorInput && 'value' in colorInput) colorInput.value = payload.accent;
      const hex = document.getElementById('theme-accent-hex');
      if (hex) hex.textContent = payload.accent;
      const customHex = document.getElementById('theme-accent-custom-hex');
      if (customHex) customHex.textContent = payload.accent;
    }
    if (payload.fullWidth !== undefined) applyLayout(payload.fullWidth);
    if (payload.diffsTheme !== undefined) {
      const selected = document.querySelector('[data-diffs-theme="' + payload.diffsTheme + '"]');
      const label = selected ? selected.getAttribute('data-diffs-theme-label') : payload.diffsTheme;
      applyDiffsTheme(payload.diffsTheme, label);
    }
    window.dispatchEvent(new CustomEvent('living-plan-theme', { detail: payload }));
  }

  async function putTheme(partial) {
    const response = await fetch(apiBase + '/api/theme', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(partial),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Failed to save settings');
    }
    const payload = await response.json();
    applyTheme(payload.theme || partial);
    return payload;
  }

  async function putAccent(accent) {
    await putTheme({ accent });
    showToast('Accent saved');
  }

  applyTheme(${JSON.stringify({
    accent: theme.accent,
    fullWidth: Boolean(theme.fullWidth),
    diffsTheme: theme.diffsTheme || DEFAULT_DIFFS_THEME,
    css: accentCssCustomProperties(theme.accent),
  })});

  document.querySelectorAll('[data-accent-swatch]').forEach((button) => {
    button.addEventListener('click', async () => {
      const accent = button.getAttribute('data-accent-swatch');
      if (!accent || accent === currentAccent) return;
      try {
        await putAccent(accent);
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Accent update failed');
      }
    });
  });

  const picker = document.getElementById('theme-accent-picker');
  if (picker) {
    picker.addEventListener('input', () => {
      if (!('value' in picker)) return;
      const hex = document.getElementById('theme-accent-hex');
      if (hex) hex.textContent = picker.value;
      const customHex = document.getElementById('theme-accent-custom-hex');
      if (customHex) customHex.textContent = picker.value;
    });
    picker.addEventListener('change', async () => {
      if (!('value' in picker)) return;
      try {
        await putAccent(picker.value);
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Accent update failed');
      }
    });
  }

  const fullWidthToggle = document.getElementById('layout-full-width');
  if (fullWidthToggle) {
    fullWidthToggle.addEventListener('change', async () => {
      if (!('checked' in fullWidthToggle)) return;
      const next = Boolean(fullWidthToggle.checked);
      const previous = currentFullWidth;
      applyLayout(next);
      try {
        await putTheme({ fullWidth: next });
        showToast(next ? 'Full width on' : 'Centered layout');
      } catch (error) {
        applyLayout(previous);
        showToast(error instanceof Error ? error.message : 'Layout update failed');
      }
    });
  }

  document.querySelectorAll('[data-accordion]').forEach((accordion) => {
    const trigger = accordion.querySelector('[data-accordion-trigger]');
    const panel = accordion.querySelector('[data-accordion-panel]');
    if (!trigger) return;
    const setOpen = (next) => {
      accordion.setAttribute('data-open', next ? 'true' : 'false');
      trigger.setAttribute('aria-expanded', next ? 'true' : 'false');
      if (panel) {
        if (next) panel.removeAttribute('inert');
        else panel.setAttribute('inert', '');
      }
    };
    setOpen(accordion.getAttribute('data-open') === 'true');
    trigger.addEventListener('click', () => {
      setOpen(accordion.getAttribute('data-open') !== 'true');
    });
  });

  document.querySelectorAll('[data-diffs-theme]').forEach((button) => {
    button.addEventListener('click', async () => {
      const next = button.getAttribute('data-diffs-theme');
      const label = button.getAttribute('data-diffs-theme-label') || next;
      if (!next || next === currentDiffsTheme) return;
      const previous = currentDiffsTheme;
      const previousLabel = document.getElementById('diffs-theme-current')?.textContent || previous;
      applyDiffsTheme(next, label);
      try {
        await putTheme({ diffsTheme: next });
        showToast('Diff theme saved');
      } catch (error) {
        applyDiffsTheme(previous, previousLabel);
        showToast(error instanceof Error ? error.message : 'Diff theme update failed');
      }
    });
  });

  function activateTab(target) {
    document.querySelectorAll('[data-tab-target]').forEach((node) => {
      node.setAttribute('aria-selected', node.getAttribute('data-tab-target') === target ? 'true' : 'false');
    });
    document.querySelectorAll('[data-tab-panel]').forEach((panel) => {
      panel.hidden = panel.getAttribute('data-tab-panel') !== target;
    });
    try { localStorage.setItem('living-plan-tab', target || 'plan'); } catch {}
    if (target === 'workflow') {
      requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    }
  }

  document.querySelectorAll('[data-tab-target]').forEach((button) => {
    button.addEventListener('click', () => {
      activateTab(button.getAttribute('data-tab-target'));
    });
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const tabJump = target.closest('[data-tab-jump]');
    if (!tabJump) return;
    activateTab(tabJump.getAttribute('data-tab-jump') || 'workflow');
  });

  try { history.scrollRestoration = 'manual'; } catch {}

  let scrollGeneration = 0;
  let jumpDepth = 0;

  function decodeToken(value) {
    const raw = String(value || '').replace(/^#/, '');
    if (!raw) return '';
    try { return decodeURIComponent(raw); } catch { return raw; }
  }

  function findPlanTarget(token) {
    const decoded = decodeToken(token);
    if (!decoded) return null;
    const ids = [decoded];
    if (decoded.startsWith('plan-')) ids.push(decoded.slice(5));
    else ids.push('plan-' + decoded);
    for (const id of ids) {
      const byId = document.getElementById(id);
      if (byId) return byId;
    }
    for (const ref of ids) {
      const byRef = document.querySelector('[data-plan-ref="' + CSS.escape(ref) + '"]');
      if (byRef) return byRef;
    }
    return null;
  }

  function canonicalRef(section, fallback) {
    return section.getAttribute('data-plan-ref') || section.id || fallback || '';
  }

  function highlightPlanTarget(section) {
    document.querySelectorAll('.plan-ref-focus').forEach((node) => node.classList.remove('plan-ref-focus'));
    if (section) section.classList.add('plan-ref-focus');
  }

  function currentView() {
    const selected = document.querySelector('[data-tab-target][aria-selected="true"]');
    return {
      tab: selected ? (selected.getAttribute('data-tab-target') || 'plan') : 'plan',
      x: window.scrollX,
      y: window.scrollY,
    };
  }

  function snapshotView() {
    const here = history.state && typeof history.state === 'object' ? history.state : {};
    const view = currentView();
    history.replaceState({ ...here, livingPlanView: { tab: view.tab, x: view.x, y: view.y, captured: true } }, '');
  }

  function scrollToPlanTarget(section, instant) {
    const generation = ++scrollGeneration;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const run = () => {
      if (generation !== scrollGeneration) return;
      section.scrollIntoView({ behavior: instant || reduce ? 'auto' : 'smooth', block: 'center' });
    };
    if (instant || reduce) {
      run();
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(run));
  }

  function focusPlanRef(ref, options) {
    const recordHistory = !options || options.recordHistory !== false;
    const instant = Boolean(options && options.instant);
    const section = findPlanTarget(ref);
    if (!section) {
      if (recordHistory) showToast('No plan section for this step');
      return;
    }
    const canonical = canonicalRef(section, decodeToken(ref));
    if (recordHistory) {
      const hash = section.id ? '#' + encodeURIComponent(section.id) : (canonical ? '#' + encodeURIComponent('plan-' + canonical) : '');
      const next = new URL(window.location.href);
      if (hash) next.hash = hash;
      const sameEntry = Boolean(hash) && history.state && history.state.livingPlanJump === canonical && location.hash === next.hash;
      if (sameEntry || jumpDepth > 0) return;
      jumpDepth += 1;
      snapshotView();
      if (hash) history.pushState({ livingPlanJump: canonical }, '', next);
      jumpDepth -= 1;
    }
    activateTab('plan');
    highlightPlanTarget(section);
    scrollToPlanTarget(section, instant);
  }

  function pinScroll(x, y) {
    const apply = () => window.scrollTo({ left: x, top: y, behavior: 'instant' });
    apply();
    requestAnimationFrame(() => {
      apply();
      requestAnimationFrame(apply);
    });
  }

  function restoreView(view) {
    scrollGeneration += 1;
    highlightPlanTarget(null);
    if (view && view.tab) activateTab(view.tab);
    if (view && typeof view.y === 'number') pinScroll(view.x || 0, view.y);
  }

  function tokenFromAnchor(link) {
    const hrefAttr = link.getAttribute('href') || '';
    if (!hrefAttr || hrefAttr.slice(0, 11).toLowerCase() === 'javascript:') return '';
    let url;
    try { url = new URL(link.href, window.location.href); } catch { return ''; }
    const sameDocument = url.origin === location.origin && url.pathname === location.pathname && url.search === location.search;
    if (sameDocument && url.hash && findPlanTarget(url.hash)) return decodeToken(url.hash);
    if (!/[/?#:]/.test(hrefAttr) && findPlanTarget(hrefAttr)) return decodeToken(hrefAttr);
    return '';
  }

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const planJump = target.closest('[data-plan-jump]');
    if (planJump) {
      const ref = planJump.getAttribute('data-plan-jump');
      if (!ref || !findPlanTarget(ref)) return;
      event.preventDefault();
      focusPlanRef(ref);
      return;
    }
    const link = target.closest('a[href]');
    if (!(link instanceof HTMLAnchorElement)) return;
    const token = tokenFromAnchor(link);
    if (!token) return;
    event.preventDefault();
    focusPlanRef(token);
  }, true);

  window.addEventListener('popstate', () => {
    const state = history.state && typeof history.state === 'object' ? history.state : {};
    if (state.livingPlanJump && state.livingPlanView && state.livingPlanView.captured) {
      scrollGeneration += 1;
      const section = findPlanTarget(state.livingPlanJump);
      if (state.livingPlanView.tab) activateTab(state.livingPlanView.tab);
      highlightPlanTarget(section);
      pinScroll(state.livingPlanView.x || 0, state.livingPlanView.y || 0);
      return;
    }
    if (state.livingPlanJump) {
      focusPlanRef(state.livingPlanJump, { recordHistory: false, instant: true });
      return;
    }
    if (state.livingPlanView && state.livingPlanView.captured) {
      restoreView(state.livingPlanView);
      return;
    }
    if (location.hash && findPlanTarget(location.hash)) {
      focusPlanRef(location.hash, { recordHistory: false, instant: true });
      return;
    }
    highlightPlanTarget(null);
  });

  window.livingPlanFocusPlanRef = focusPlanRef;

  try {
    let saved = localStorage.getItem('living-plan-tab');
    if (saved === 'execution') saved = 'workflow';
    const preferred = ${JSON.stringify(executionActive)} ? 'workflow' : (saved || 'plan');
    if (preferred) activateTab(preferred);
  } catch {}

  if (!interactionsLocked && location.hash && findPlanTarget(location.hash)) {
    focusPlanRef(location.hash, { recordHistory: false, instant: true });
  }

  async function postJson(url, body) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Request failed');
    }
    return response.json();
  }

  function markState(id, text) {
    const el = document.querySelector('[data-state-for="' + id + '"]');
    if (el) el.innerHTML = text;
  }

  document.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof Element) || interactionsLocked) return;
    const choice = target.closest('[data-choice-id]');
    if (choice instanceof HTMLButtonElement) {
      const id = choice.getAttribute('data-choice-id');
      const optionId = choice.getAttribute('data-option-id');
      const label = choice.getAttribute('data-option-label');
      if (!id || !optionId || !label) return;
      await postJson(apiBase + '/api/interactions/' + encodeURIComponent(id), {
        kind: 'choice',
        id,
        optionId,
        label,
      });
      document.querySelectorAll('[data-choice-id="' + id + '"]').forEach((node) => {
        node.disabled = true;
        node.classList.toggle('selected', node.getAttribute('data-option-id') === optionId);
      });
      markState(id, 'Selected: <strong>' + label + '</strong>');
      showToast('Choice sent to agent');
      return;
    }
    const approve = target.closest('[data-approve-id]');
    if (!(approve instanceof HTMLButtonElement)) return;
    const id = approve.getAttribute('data-approve-id');
    const approved = approve.getAttribute('data-approved') === 'true';
    if (!id) return;
    const note = document.querySelector('[data-approve-note="' + id + '"]');
    await postJson(apiBase + '/api/interactions/' + encodeURIComponent(id), {
      kind: 'approve',
      id,
      approved,
      note: note && 'value' in note ? note.value : undefined,
    });
    document.querySelectorAll('[data-approve-id="' + id + '"]').forEach((node) => {
      node.disabled = true;
    });
    if (note) note.disabled = true;
    markState(id, approved ? 'Approved' : 'Denied');
    showToast(approved ? 'Approved' : 'Denied');
  });

  document.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || interactionsLocked) return;
    const formId = form.getAttribute('data-form-id');
    const questionsId = form.getAttribute('data-questions-id');
    if (!formId && !questionsId) return;
    event.preventDefault();
    if (formId) {
      const data = new FormData(form);
      const values = {};
      data.forEach((value, key) => {
        values[key] = typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value)) && form.querySelector('[name="' + key + '"][type="number"]')
          ? Number(value)
          : value;
      });
      await postJson(apiBase + '/api/interactions/' + encodeURIComponent(formId), {
        kind: 'form',
        id: formId,
        values,
      });
      form.querySelectorAll('input, textarea, select, button').forEach((node) => {
        node.disabled = true;
      });
      markState(formId, 'Submitted');
      showToast('Form submitted');
      return;
    }
    const data = new FormData(form);
    const answers = {};
    data.forEach((value, key) => {
      answers[key] = String(value);
    });
    await postJson(apiBase + '/api/interactions/' + encodeURIComponent(questionsId), {
      kind: 'questions',
      id: questionsId,
      answers,
    });
    form.querySelectorAll('textarea, button').forEach((node) => {
      node.disabled = true;
    });
    markState(questionsId, 'Answers sent');
    showToast('Answers sent');
  });

  function applyMode(payload) {
    if (!payload || (payload.mode !== 'watch' && payload.mode !== 'comment' && payload.mode !== 'review')) return;
    mode = payload.mode;
    setModeChip(mode);
    document.body.dataset.planMode = mode;
    const decision = payload.review && payload.review.decision;
    setReview(decision || '');
    const showBar = mode === 'review' && !decision && !interactionsLocked;
    document.body.classList.toggle('has-review-bar', showBar);
    const dock = document.getElementById('review-dock');
    if (dock) dock.hidden = !showBar;
    window.dispatchEvent(new CustomEvent('living-plan-mode', { detail: { mode: mode } }));
  }

  const reviewNote = document.getElementById('review-note');
  if (reviewNote instanceof HTMLTextAreaElement) {
    const fitReviewNote = () => {
      reviewNote.style.height = 'auto';
      const next = Math.min(reviewNote.scrollHeight, 144);
      reviewNote.style.height = next + 'px';
    };
    reviewNote.addEventListener('input', fitReviewNote);
    fitReviewNote();
  }
  document.querySelectorAll('[data-review-decision]').forEach((button) => {
    button.addEventListener('click', async () => {
      const decision = button.getAttribute('data-review-decision');
      const note = document.getElementById('review-note');
      await postJson(apiBase + '/api/review', {
        decision,
        note: note && 'value' in note ? note.value : undefined,
        comments: [],
      });
      showToast('Review ' + decision);
    });
  });

  function blockKey(node) {
    return node.getAttribute('data-plan-part') || node.id || '';
  }

  function animateBlockHeight(node, from, to, done) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || Math.abs(from - to) < 1) {
      if (done) done();
      return;
    }
    node.style.overflow = 'hidden';
    node.style.height = from + 'px';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        node.style.transition = 'height 0.4s ease';
        node.style.height = to + 'px';
      });
    });
    node.addEventListener('transitionend', function onEnd(event) {
      if (event.propertyName !== 'height') return;
      node.removeEventListener('transitionend', onEnd);
      node.style.height = '';
      node.style.overflow = '';
      node.style.transition = '';
      if (done) done();
    });
  }

  function syncDiffClass(previous, next) {
    ['diff-added', 'diff-edited', 'diff-unchanged', 'diff-removed'].forEach((name) => {
      previous.classList.toggle(name, next.classList.contains(name));
    });
  }

  function patchStack(stack, nextStack) {
    const incoming = [...nextStack.querySelectorAll(':scope > .block')];
    const live = new Map();
    stack.querySelectorAll(':scope > .block').forEach((node) => {
      const key = blockKey(node);
      if (key && !live.has(key)) live.set(key, node);
    });
    let applied = 0;
    let anchor = null;
    incoming.forEach((next) => {
      const key = blockKey(next);
      const previous = key ? live.get(key) : undefined;
      if (previous) live.delete(key);
      const same = previous
        && previous.getAttribute('data-plan-stamp')
        && previous.getAttribute('data-plan-stamp') === next.getAttribute('data-plan-stamp');
      if (previous && same) {
        syncDiffClass(previous, next);
        const expected = anchor ? anchor.nextElementSibling : stack.querySelector(':scope > .block');
        if (previous !== expected) stack.insertBefore(previous, anchor ? anchor.nextSibling : stack.firstChild);
        anchor = previous;
        return;
      }
      next.classList.add('change-applied');
      if (next instanceof HTMLElement) next.style.animationDelay = (applied * 70) + 'ms';
      applied += 1;
      const from = previous instanceof HTMLElement ? previous.getBoundingClientRect().height : 0;
      if (previous) previous.replaceWith(next);
      else stack.insertBefore(next, anchor ? anchor.nextSibling : stack.firstChild);
      if (next instanceof HTMLElement && !next.querySelector('.mermaid-diagram, pre.code-block')) {
        animateBlockHeight(next, from, next.getBoundingClientRect().height);
      }
      window.dispatchEvent(new CustomEvent('living-plan-document', { detail: { root: next } }));
      anchor = next;
    });
    live.forEach((node) => {
      if (!(node instanceof HTMLElement)) {
        node.remove();
        return;
      }
      const from = node.getBoundingClientRect().height;
      animateBlockHeight(node, from, 0, () => node.remove());
    });
  }

  let refreshing = false;
  async function refreshPlan() {
    if (refreshing) return;
    refreshing = true;
    try {
      const response = await fetch(window.location.href, { headers: { accept: 'text/html' } });
      if (!response.ok) throw new Error('refresh failed');
      const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
      const nextStack = parsed.querySelector('main.stack');
      const stack = document.querySelector('main.stack');
      document.body.classList.add('plan-live');
      if (nextStack && stack) patchStack(stack, nextStack);
      const nextTitle = parsed.querySelector('h1.brand');
      const title = document.querySelector('h1.brand');
      if (nextTitle && title) title.textContent = nextTitle.textContent || '';
      const nextLede = parsed.querySelector('p.lede');
      const lede = document.querySelector('p.lede');
      if (nextLede && lede) lede.textContent = nextLede.textContent || '';
      const nextPending = parsed.querySelector('[data-pending-count]');
      if (nextPending) syncPending(nextPending.textContent || '0');
      if (parsed.title) document.title = parsed.title;
    } catch {
      showToast('Could not update the plan');
    } finally {
      refreshing = false;
    }
  }

  // One EventSource per page — shared with PlanSelector / execution canvas via
  // window.__livingPlanEvents. Three streams × three tabs saturates Chromium's
  // ~6 HTTP/1.1 connections/host and hangs simultaneous reloads.
  const existing = window.__livingPlanEvents;
  const source =
    existing && existing.readyState !== EventSource.CLOSED
      ? existing
      : new EventSource(apiBase + '/api/events');
  window.__livingPlanEvents = source;
  const releaseEvents = () => {
    if (window.__livingPlanEvents !== source) return;
    source.close();
    delete window.__livingPlanEvents;
  };
  window.addEventListener('pagehide', releaseEvents);
  window.addEventListener('beforeunload', releaseEvents);
  let streamWarnedAt = 0;
  source.addEventListener('error', (event) => {
    if (event && event.data) return;
    const report = window.__livingPlanReport;
    if (typeof report !== 'function') return;
    const now = Date.now();
    if (now - streamWarnedAt < 10000) return;
    streamWarnedAt = now;
    report('warn', 'The plan event stream is not connected.', '', 'page');
  });
  source.addEventListener('reload', () => {
    void refreshPlan();
  });
  source.addEventListener('theme', (event) => {
    try {
      applyTheme(JSON.parse(event.data));
    } catch {}
  });
  source.addEventListener('execution', (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (Boolean(payload.active) !== interactionsLocked) {
        window.location.reload();
      }
    } catch {}
  });
  source.addEventListener('interaction', (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (!payload || typeof payload.id !== 'string') return;
      if (payload.kind === 'choice' && typeof payload.label === 'string') {
        markState(payload.id, 'Selected: <strong>' + payload.label + '</strong>');
        return;
      }
      if (payload.kind === 'form') {
        markState(payload.id, 'Submitted');
        return;
      }
      if (payload.kind === 'questions') {
        markState(payload.id, 'Answers sent');
        return;
      }
      if (payload.kind === 'approve') {
        markState(payload.id, payload.approved ? 'Approved' : 'Denied');
        return;
      }
      markState(payload.id, 'Updated');
    } catch {}
  });
  source.addEventListener('review', (event) => {
    showToast('Review submitted');
    try {
      const payload = JSON.parse(event.data);
      if (!payload || payload.decision !== 'iterate') return;
      document.body.classList.remove('has-review-bar');
      const dock = document.getElementById('review-dock');
      if (dock) dock.hidden = true;
      setReview('iterate');
      window.dispatchEvent(new CustomEvent('living-plan-review', { detail: payload }));
    } catch {}
  });
  source.addEventListener('mode', (event) => {
    try {
      applyMode(JSON.parse(event.data));
    } catch {}
  });
})();
`
}

function statusIcon(paths: string, attrs = ''): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${attrs}>${paths}</svg>`
}

const MODE_ICON = {
  watch: statusIcon('<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>', ' data-mode-icon="watch"'),
  review: statusIcon('<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>', ' data-mode-icon="review"'),
  comment: statusIcon('<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/>', ' data-mode-icon="comment"'),
} as const

const AGENT_ICON = statusIcon('<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>')
const ITERATION_ICON = statusIcon('<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>')
const PENDING_ICON = statusIcon('<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>')
const CHANGED_ICON = statusIcon('<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M9 10h6"/><path d="M12 13V7"/><path d="M9 17h6"/>')
const REVIEW_ICON = {
  approve: statusIcon('<path d="M20 6 9 17l-5-5"/>', ' data-review-icon="approve"'),
  deny: statusIcon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', ' data-review-icon="deny"'),
  iterate: statusIcon('<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>', ' data-review-icon="iterate"'),
} as const

const TAB_ICONS = {
  plan: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>',
  workflow: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/></svg>',
  settings: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/></svg>',
} as const

function tabButton(target: keyof typeof TAB_ICONS, label: string, selected: boolean): string {
  return `<button type="button" class="tab-btn" role="tab" data-tab-target="${target}" aria-selected="${selected ? 'true' : 'false'}" aria-label="${label}">${TAB_ICONS[target]}</button>`
}

export function renderPlanPage(options: {
  plan: PlanDocument
  mode: PlanMode
  responses: Record<string, InteractionResponse>
  diffs: SectionDiff[]
  iteration: number
  pendingInteractionIds: string[]
  reviewDecision?: ReviewDecision
  review?: ReviewResult | null
  execution: ExecutionState
  clientAssets?: ClientAssets | null
  theme: RenderTheme
  /** Prefix for this plan's API. Empty when the plan owns the origin. */
  basePath?: string
  selfId?: string
  comments?: PlanComment[]
  /** Newest changelog, already parsed. Omit to hide the release block. */
  changelog?: ChangelogRelease | null
  /** Append-only source history for the MDX page. */
  mdxSnapshots?: PlanSnapshotRecord[]
  mdxHeadSnapshotId?: string | null
}): string {
  const {
    plan,
    mode,
    responses,
    diffs,
    iteration,
    pendingInteractionIds,
    reviewDecision,
    execution,
    clientAssets,
    theme,
  } = options
  const basePath = options.basePath ?? ''
  const selfId = options.selfId
  const commentsJson = JSON.stringify(options.comments ?? []).replaceAll('<', '\\u003c')
  const reviewJson = JSON.stringify(options.review ?? null).replaceAll('<', '\\u003c')
  const mdxBoot = JSON.stringify({
    source: plan.source,
    title: plan.title,
    responses,
    locked: Boolean(execution.active),
    snapshots: options.mdxSnapshots ?? [],
    headSnapshotId: options.mdxHeadSnapshotId ?? null,
  }).replaceAll('<', '\\u003c')

  const locked = Boolean(execution.active)
  const pendingCount = pendingInteractionIds.length
  const showReviewBar = mode === 'review' && !reviewDecision && !locked
  const planned = planToExpectedGraph(plan)
  const workflowState = locked ? 'live' : planned ? 'planned' : 'idle'
  const flags = planSourceFlags(plan.source)
  const hasMermaid = flags.mermaid
  const hasCode = flags.code
  const planMdxHref = clientAssets?.planMdxHref
  const planMdxCss = (clientAssets?.planMdxCssHrefs ?? [])
    .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}" />`)
    .join('\n')
  const staticPlan = renderPlanStaticHtml(plan.source)
  const body = `<div id="plan-mdx-root" data-plan-mdx class="${planMdxHref ? 'plan-mdx-pending' : ''}">${staticPlan}</div>`

  const changed = diffs.filter((diff) => diff.status !== 'unchanged').length
  const assetCss = [
    ...(clientAssets?.cssHrefs ?? []),
    ...(clientAssets?.selectorCssHrefs ?? []),
    ...(hasMermaid ? (clientAssets?.mermaidCssHrefs ?? []) : []),
    ...(hasCode ? (clientAssets?.highlightCssHrefs ?? []) : []),
  ]
    .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}" />`)
    .join('\n')
  const assetJs = clientAssets
    ? `<script type="module" src="${escapeHtml(clientAssets.jsHref)}"></script>`
    : ''
  const mermaidJs =
    hasMermaid && clientAssets?.mermaidHref
      ? `<script type="module" src="${escapeHtml(clientAssets.mermaidHref)}"></script>`
      : ''
  const highlightJs =
    hasCode && clientAssets?.highlightHref
      ? `<script type="module" src="${escapeHtml(clientAssets.highlightHref)}"></script>`
      : ''
  const selectorJs = clientAssets?.selectorHref
    ? `<script type="module" src="${escapeHtml(clientAssets.selectorHref)}"></script>`
    : ''
  const planMdxJs = planMdxHref
    ? `<script type="module" src="${escapeHtml(planMdxHref)}"></script>`
    : ''
  const executionFallback = clientAssets
    ? ''
    : `<div class="execution-empty">Build the client with <code>npm run build:client</code> to enable the workflow canvas.</div>`
  const bootstrap = JSON.stringify(withPlannedWorkflow(execution, plan)).replaceAll('<', '\\u003c')
  const configName = theme.configPath.split(/[\\/]/).pop() || 'live-plan.config.json'
  const swatches = theme.presets
    .map((preset) => {
      const selected = preset.accent === theme.accent
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

  const layoutMode = theme.fullWidth ? 'full' : 'centered'
  const diffsThemeId = theme.diffsTheme || DEFAULT_DIFFS_THEME
  const diffsPresets = theme.diffsThemes?.length
    ? theme.diffsThemes
    : [diffsThemePreset(diffsThemeId)]
  const currentDiffs = diffsThemePreset(diffsThemeId)
  const diffsOptions = diffsThemeOptionsMarkup(diffsPresets, currentDiffs.id)
  return `<!doctype html>
<html lang="en" data-accent="${escapeHtml(theme.accent)}" data-layout="${layoutMode}" data-diffs-theme="${escapeHtml(currentDiffs.id)}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${faviconLink}
  <script>${THEME_BOOTSTRAP}</script>
  <title>${escapeHtml(plan.title)} · Living Plan</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>${STYLES}${PROCESSES_PANEL_STYLES}</style>
  ${assetCss}
  ${planMdxCss}
  ${accentStyleTag(theme.accent)}
  ${planMdxHref ? '<style>.plan-mdx-pending{display:none}</style><noscript><style>.plan-mdx-pending{display:block}</style></noscript>' : ''}
</head>
<body class="${showReviewBar ? 'has-review-bar' : ''}${theme.fullWidth ? ' layout-full' : ''}" data-plan-mode="${escapeHtml(mode)}">
  <header class="titlebar">
    <div class="plan-details" data-plan-details>
      <button type="button" class="logo-btn" data-plan-details-toggle aria-expanded="false" aria-controls="plan-card" aria-label="${pendingCount > 0 ? `Plan details, ${pendingCount} pending` : 'Plan details'}">
        <img class="titlebar-logo" src="/favicon.png" alt="" width="29" height="29" />
        <span class="logo-badge" data-pending-badge${pendingCount > 0 ? '' : ' hidden'}>${pendingCount}</span>
      </button>
      <div class="plan-card" id="plan-card" data-plan-card role="dialog" aria-labelledby="plan-title" hidden>
        ${plan.summary ? `<p class="lede">${escapeHtml(plan.summary)}</p>` : ''}
        <div class="facts">
          <span class="fact solo" data-plan-mode-chip data-mode="${escapeHtml(mode)}" title="Mode · ${escapeHtml(mode)}" aria-label="Mode · ${escapeHtml(mode)}">${MODE_ICON.watch}${MODE_ICON.review}${MODE_ICON.comment}<span class="sr" data-plan-mode-value>${escapeHtml(mode)}</span></span>
          ${plan.agent ? `<span class="fact" title="Agent · ${escapeHtml(plan.agent)}" aria-label="Agent · ${escapeHtml(plan.agent)}">${AGENT_ICON}<span class="val">${escapeHtml(plan.agent)}</span></span>` : ''}
          <span class="fact" title="Iteration · v${iteration}" aria-label="Iteration · v${iteration}">${ITERATION_ICON}<span class="val">v${iteration}</span></span>
          <span class="fact" data-pending-fact title="Pending · ${pendingCount}" aria-label="Pending · ${pendingCount}"${pendingCount > 0 ? '' : ' hidden'}>${PENDING_ICON}<span class="val" data-pending-count>${pendingCount}</span></span>
          <span class="fact solo" data-workflow="${workflowState}" title="Workflow · ${escapeHtml(workflowState)}" aria-label="Workflow · ${escapeHtml(workflowState)}">${TAB_ICONS.workflow}</span>
          ${changed ? `<span class="fact" title="Changed · ${changed}" aria-label="Changed · ${changed}">${CHANGED_ICON}<span class="val">${changed}</span></span>` : ''}
          <span class="fact solo" data-review-chip data-decision="${escapeHtml(reviewDecision ?? '')}" title="${reviewDecision ? `Review · ${escapeHtml(reviewDecision)}` : 'Review'}" aria-label="${reviewDecision ? `Review · ${escapeHtml(reviewDecision)}` : 'Review'}"${reviewDecision ? '' : ' hidden'}>${REVIEW_ICON.approve}${REVIEW_ICON.deny}${REVIEW_ICON.iterate}<span class="sr" data-review-value>${escapeHtml(reviewDecision ?? '')}</span></span>
        </div>
      </div>
    </div>
    <h1 class="brand" id="plan-title">${escapeHtml(plan.title)}</h1>
    <div class="chrome-tools">
      <div class="tabs" role="tablist" aria-label="Living Plan views">
        ${tabButton('plan', 'Plan', true)}
        ${tabButton('workflow', 'Workflow', false)}
        ${tabButton('settings', 'Settings', false)}
      </div>
      ${processesPanelMarkup(selfId)}
    </div>
  </header>
  <div class="shell">
    <section class="tab-panel${locked ? ' plan-locked' : ''}" data-tab-panel="plan" role="tabpanel">
      ${
        locked
          ? `<div class="lock-banner">Execution is live. Plan forms and gates are disabled until the agent stops execution. Switch to the Workflow tab to follow the live canvas.</div>`
          : ''
      }
      <main class="stack">
        ${body}
      </main>
    </section>
    <section class="tab-panel" data-tab-panel="workflow" role="tabpanel" hidden>
      <script id="living-plan-bootstrap" type="application/json">${bootstrap}</script>
      <script>window.__LIVE_PLAN_BASE__ = ${JSON.stringify(basePath)};</script>
      <div id="execution-root">${executionFallback}</div>
      ${assetJs}
    </section>
    <section class="tab-panel" data-tab-panel="settings" role="tabpanel" hidden>
      <main class="settings-stack">
        ${options.changelog ? changelogSectionHtml(options.changelog) : ''}
        <section class="block settings-section" data-section>
          <div class="settings-kicker">Appearance</div>
          <h3>Accent color</h3>
          <p class="settings-copy">Pick one of eight presets tuned for light and dark mode, or set a custom hex. Changes save to the theme config and update the page live.</p>
          <div class="settings-preview">
            <span class="chip"><span class="live-dot"></span> Preview</span>
            <span class="chip">Accent <strong id="theme-accent-hex">${escapeHtml(theme.accent)}</strong></span>
          </div>
          <div class="theme-swatches" role="radiogroup" aria-label="Accent presets">
            ${swatches}
          </div>
          <label class="theme-custom">
            <span>Custom</span>
            <input id="theme-accent-picker" type="color" value="${escapeHtml(theme.accent)}" aria-label="Custom accent color" />
            <code id="theme-accent-custom-hex">${escapeHtml(theme.accent)}</code>
          </label>
          <p class="settings-meta">Saved to <code>${escapeHtml(configName)}</code>. Agents can also run <code>live-plan theme set --accent #hex</code>.</p>
        </section>
        <section class="block settings-section" data-section>
          <div class="settings-kicker">Layout</div>
          <h3>Page width</h3>
          <p class="settings-copy">Use the centered column by default, or stretch the plan content across the viewport.</p>
          <label class="settings-toggle" for="layout-full-width">
            <input id="layout-full-width" type="checkbox"${theme.fullWidth ? ' checked' : ''} />
            <span class="settings-toggle-copy">
              <strong>Full width</strong>
              <span>Remove the centered column margins and let Plan, Workflow, and Settings use the available width.</span>
            </span>
          </label>
          <p class="settings-meta">Saved to <code>${escapeHtml(configName)}</code> with the accent settings.</p>
        </section>
        <section class="block settings-section" data-section>
          <div class="settings-kicker">Code &amp; diffs</div>
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
                    ${diffsOptions}
                  </div>
                  <p class="settings-meta" style="margin-top:0.85rem">Saved to <code>${escapeHtml(configName)}</code> as <code>theme.diffsTheme</code>.</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </section>
  </div>
  <div id="review-dock" class="review-dock"${showReviewBar ? '' : ' hidden'}>
    <div class="review-bar" role="region" aria-label="Review this plan">
      <div class="actions">
        <button class="btn danger" data-review-decision="deny">Deny</button>
      </div>
    </div>
  </div>
  <div id="toast" class="toast" role="status"></div>
  <script type="application/json" id="living-plan-comments">${commentsJson}</script>
  <script type="application/json" id="living-plan-review">${reviewJson}</script>
  <script type="application/json" id="living-plan-mdx">${mdxBoot}</script>
  <script>${clientLogScript(`${basePath}/api/logs`)}</script>
  <script>${clientScript(mode, locked, theme, basePath)}
${processesPanelScript()}</script>
  ${mermaidJs}
  ${highlightJs}
  ${selectorJs}
  ${planMdxJs}
</body>
</html>`
}
