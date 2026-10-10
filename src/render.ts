import type { ClientAssets } from './assets.js'
import type { ExecutionState } from './execution.js'
import { blockAnchorId } from './parse.js'
import { PROCESSES_PANEL_STYLES, processesPanelMarkup, processesPanelScript } from './processesPanel.js'
import { accentCssCustomProperties } from './theme.js'
import type {
  InteractionResponse,
  PlanBlock,
  PlanDocument,
  ReviewDecision,
  SectionDiff,
} from './types.js'
import { planToExpectedGraph, withPlannedWorkflow } from './workflow.js'

export type RenderTheme = {
  accent: string
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

function responseFor(
  responses: Record<string, InteractionResponse>,
  id: string,
): InteractionResponse | undefined {
  return responses[id]
}

function anchorAttrs(anchorId?: string): string {
  if (!anchorId) return ''
  return ` id="plan-${escapeHtml(anchorId)}" data-plan-ref="${escapeHtml(anchorId)}" tabindex="-1"`
}

function renderPhase(
  block: Extract<PlanBlock, { type: 'phase' }>,
  anchorId: string | undefined,
  diff?: SectionDiff,
): string {
  return `
    <section class="block phase status-${block.status} diff-${diff?.status ?? 'unchanged'}" data-section${anchorAttrs(anchorId)}>
      <div class="phase-rail" aria-hidden="true"></div>
      <div class="phase-body">
        <div class="phase-meta">
          <span class="phase-status">${escapeHtml(block.status)}</span>
          <h3>${escapeHtml(block.title)}</h3>
        </div>
        <div class="rich">${block.bodyHtml}</div>
      </div>
    </section>
  `
}

function renderCallout(
  block: Extract<PlanBlock, { type: 'callout' }>,
  anchorId: string | undefined,
  diff?: SectionDiff,
): string {
  return `
    <section class="block callout kind-${block.kind} diff-${diff?.status ?? 'unchanged'}" data-section${anchorAttrs(anchorId)}>
      <div class="callout-label">${escapeHtml(block.kind)}${block.title ? ` · ${escapeHtml(block.title)}` : ''}</div>
      <div class="rich">${block.bodyHtml}</div>
    </section>
  `
}

function renderChoice(
  block: Extract<PlanBlock, { type: 'choice' }>,
  responses: Record<string, InteractionResponse>,
  locked: boolean,
  anchorId: string | undefined,
  diff?: SectionDiff,
): string {
  const existing = responseFor(responses, block.id)
  const selected = existing?.kind === 'choice' ? existing.optionId : undefined
  const disabled = Boolean(existing) || locked
  const options = block.options
    .map((option) => {
      const isSelected = selected === option.id
      return `
        <button
          type="button"
          class="choice-option${isSelected ? ' selected' : ''}"
          data-choice-id="${escapeHtml(block.id)}"
          data-option-id="${escapeHtml(option.id)}"
          data-option-label="${escapeHtml(option.label)}"
          ${disabled ? 'disabled' : ''}
        >
          <span class="choice-label">${escapeHtml(option.label)}</span>
          ${option.description ? `<span class="choice-desc">${escapeHtml(option.description)}</span>` : ''}
        </button>
      `
    })
    .join('')

  return `
    <section class="block interaction choice diff-${diff?.status ?? 'unchanged'}" data-section data-interaction-id="${escapeHtml(block.id)}"${anchorAttrs(anchorId)}>
      <div class="interaction-kicker">Needs your choice</div>
      <h3>${escapeHtml(block.prompt)}</h3>
      <div class="choice-grid">${options}</div>
      <div class="interaction-state" data-state-for="${escapeHtml(block.id)}">
        ${
          locked
            ? 'Locked during execution'
            : selected
              ? `Selected: <strong>${escapeHtml(selected)}</strong>`
              : 'Waiting for a selection'
        }
      </div>
    </section>
  `
}

function renderApprove(
  block: Extract<PlanBlock, { type: 'approve' }>,
  responses: Record<string, InteractionResponse>,
  locked: boolean,
  anchorId: string | undefined,
  diff?: SectionDiff,
): string {
  const existing = responseFor(responses, block.id)
  const decided = existing?.kind === 'approve' ? existing : undefined
  const disabled = Boolean(decided) || locked

  return `
    <section class="block interaction approve diff-${diff?.status ?? 'unchanged'}" data-section data-interaction-id="${escapeHtml(block.id)}"${anchorAttrs(anchorId)}>
      <div class="interaction-kicker">Approval gate</div>
      <h3>${escapeHtml(block.prompt)}</h3>
      <div class="rich">${block.bodyHtml}</div>
      <label class="field">
        <span>Optional note</span>
        <textarea data-approve-note="${escapeHtml(block.id)}" ${disabled ? 'disabled' : ''} placeholder="Direction for the agent">${decided?.note ? escapeHtml(decided.note) : ''}</textarea>
      </label>
      <div class="button-row">
        <button type="button" class="btn danger" data-approve-id="${escapeHtml(block.id)}" data-approved="false" ${disabled ? 'disabled' : ''}>Deny</button>
        <button type="button" class="btn primary" data-approve-id="${escapeHtml(block.id)}" data-approved="true" ${disabled ? 'disabled' : ''}>Approve</button>
      </div>
      <div class="interaction-state" data-state-for="${escapeHtml(block.id)}">
        ${
          locked
            ? 'Locked during execution'
            : decided
              ? decided.approved
                ? 'Approved'
                : 'Denied'
              : 'Waiting for approval'
        }
      </div>
    </section>
  `
}

function renderForm(
  block: Extract<PlanBlock, { type: 'form' }>,
  responses: Record<string, InteractionResponse>,
  locked: boolean,
  anchorId: string | undefined,
  diff?: SectionDiff,
): string {
  const existing = responseFor(responses, block.id)
  const values = existing?.kind === 'form' ? existing.values : {}
  const disabled = Boolean(existing) || locked
  const fields = block.fields
    .map((field) => {
      const current = values[field.name] ?? field.default ?? ''
      if (field.type === 'textarea') {
        return `
          <label class="field">
            <span>${escapeHtml(field.label)}${field.required ? ' *' : ''}</span>
            <textarea name="${escapeHtml(field.name)}" ${field.required ? 'required' : ''} ${disabled ? 'disabled' : ''} placeholder="${escapeHtml(field.placeholder ?? '')}">${escapeHtml(String(current))}</textarea>
          </label>
        `
      }
      if (field.type === 'select') {
        const options = (field.options ?? [])
          .map(
            (option) =>
              `<option value="${escapeHtml(option)}" ${String(current) === option ? 'selected' : ''}>${escapeHtml(option)}</option>`,
          )
          .join('')
        return `
          <label class="field">
            <span>${escapeHtml(field.label)}${field.required ? ' *' : ''}</span>
            <select name="${escapeHtml(field.name)}" ${field.required ? 'required' : ''} ${disabled ? 'disabled' : ''}>${options}</select>
          </label>
        `
      }
      return `
        <label class="field">
          <span>${escapeHtml(field.label)}${field.required ? ' *' : ''}</span>
          <input
            type="${field.type === 'number' ? 'number' : 'text'}"
            name="${escapeHtml(field.name)}"
            value="${escapeHtml(String(current))}"
            ${field.required ? 'required' : ''}
            ${disabled ? 'disabled' : ''}
            placeholder="${escapeHtml(field.placeholder ?? '')}"
          />
        </label>
      `
    })
    .join('')

  return `
    <section class="block interaction form diff-${diff?.status ?? 'unchanged'}" data-section data-interaction-id="${escapeHtml(block.id)}"${anchorAttrs(anchorId)}>
      <div class="interaction-kicker">Needs input</div>
      <h3>${escapeHtml(block.prompt)}</h3>
      <form data-form-id="${escapeHtml(block.id)}">
        ${fields}
        <button type="submit" class="btn primary" ${disabled ? 'disabled' : ''}>Submit</button>
      </form>
      <div class="interaction-state" data-state-for="${escapeHtml(block.id)}">
        ${locked ? 'Locked during execution' : existing ? 'Submitted' : 'Waiting for form values'}
      </div>
    </section>
  `
}

function renderQuestions(
  block: Extract<PlanBlock, { type: 'questions' }>,
  responses: Record<string, InteractionResponse>,
  locked: boolean,
  anchorId: string | undefined,
  diff?: SectionDiff,
): string {
  const existing = responseFor(responses, block.id)
  const answers = existing?.kind === 'questions' ? existing.answers : {}
  const disabled = Boolean(existing) || locked
  const items = block.items
    .map((item, index) => {
      const key = String(index)
      return `
        <label class="field">
          <span>${index + 1}. ${escapeHtml(item)}</span>
          <textarea name="${key}" ${disabled ? 'disabled' : ''} placeholder="Your answer">${escapeHtml(String(answers[key] ?? ''))}</textarea>
        </label>
      `
    })
    .join('')

  return `
    <section class="block interaction questions diff-${diff?.status ?? 'unchanged'}" data-section data-interaction-id="${escapeHtml(block.id)}"${anchorAttrs(anchorId)}>
      <div class="interaction-kicker">Open questions</div>
      ${block.prompt ? `<h3>${escapeHtml(block.prompt)}</h3>` : '<h3>Please answer</h3>'}
      <form data-questions-id="${escapeHtml(block.id)}">
        ${items}
        <button type="submit" class="btn primary" ${disabled ? 'disabled' : ''}>Send answers</button>
      </form>
      <div class="interaction-state" data-state-for="${escapeHtml(block.id)}">
        ${locked ? 'Locked during execution' : existing ? 'Answers sent' : 'Waiting for answers'}
      </div>
    </section>
  `
}

function renderChecklist(
  block: Extract<PlanBlock, { type: 'checklist' }>,
  anchorId: string | undefined,
  diff?: SectionDiff,
): string {
  const items = block.items
    .map(
      (item) =>
        `<li class="${item.done ? 'done' : ''}"><span class="check">${item.done ? 'done' : 'todo'}</span>${escapeHtml(item.text)}</li>`,
    )
    .join('')
  return `
    <section class="block checklist diff-${diff?.status ?? 'unchanged'}" data-section${anchorAttrs(anchorId)}>
      ${block.title ? `<h3>${escapeHtml(block.title)}</h3>` : ''}
      <ul>${items}</ul>
    </section>
  `
}

function renderWorkflow(
  block: Extract<PlanBlock, { type: 'workflow' }>,
  anchorId: string | undefined,
  diff?: SectionDiff,
): string {
  const steps = block.nodes
    .map((node) => {
      const ref = node.ref ?? node.id
      const label = node.label ?? node.id
      return `
        <li>
          <button type="button" class="workflow-step" data-plan-jump="${escapeHtml(ref)}">
            <span class="workflow-step-label">${escapeHtml(label)}</span>
            <span class="workflow-step-ref">Plan · ${escapeHtml(ref)}</span>
          </button>
        </li>
      `
    })
    .join('')

  return `
    <section class="block workflow diff-${diff?.status ?? 'unchanged'}" data-section${anchorAttrs(anchorId)}>
      <div class="interaction-kicker">Expected workflow</div>
      <h3>${escapeHtml(block.title ?? 'Execution plan')}</h3>
      <p class="workflow-note">These steps are the execution plan before the run is laid down. The Workflow tab draws the same path. Select a step there to jump to the matching place in this plan.</p>
      <ol class="workflow-steps">${steps}</ol>
      <button type="button" class="btn" data-tab-jump="workflow">Open workflow diagram</button>
    </section>
  `
}

function renderBlock(
  block: PlanBlock,
  index: number,
  responses: Record<string, InteractionResponse>,
  diffs: SectionDiff[],
  locked: boolean,
): string {
  const diff = diffs.find((entry) => entry.index === index)
  const anchorId = blockAnchorId(block, index)
  switch (block.type) {
    case 'markdown':
      return `<section class="block markdown diff-${diff?.status ?? 'unchanged'}" data-section${anchorAttrs(anchorId)}><div class="rich">${block.html}</div></section>`
    case 'phase':
      return renderPhase(block, anchorId, diff)
    case 'callout':
      return renderCallout(block, anchorId, diff)
    case 'choice':
      return renderChoice(block, responses, locked, anchorId, diff)
    case 'approve':
      return renderApprove(block, responses, locked, anchorId, diff)
    case 'form':
      return renderForm(block, responses, locked, anchorId, diff)
    case 'questions':
      return renderQuestions(block, responses, locked, anchorId, diff)
    case 'checklist':
      return renderChecklist(block, anchorId, diff)
    case 'workflow':
      return renderWorkflow(block, anchorId, diff)
  }
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
  --ink: #14201b;
  --muted: #5b6b63;
  --paper: #eef3f0;
  --paper-2: #e3ebe6;
  --page-top: #f7faf8;
  --panel: rgba(255, 255, 255, 0.72);
  --panel-strong: rgba(255, 255, 255, 0.86);
  --line: rgba(20, 32, 27, 0.12);
  --accent: #0f766e;
  --accent-2: #b45309;
  --danger: #b42318;
  --ok: #166534;
  --on-accent: #ffffff;
  --shadow: 0 18px 50px rgba(20, 32, 27, 0.08);
  --radius: 18px;
  --font-display: "Fraunces", "Iowan Old Style", Georgia, serif;
  --font-body: "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif;
  --wash-accent: rgba(15, 118, 110, 0.16);
  --wash-warm: rgba(180, 83, 9, 0.12);
  --chip-bg: rgba(255, 255, 255, 0.55);
  --tabs-bg: rgba(255, 255, 255, 0.62);
  --control-bg: rgba(255, 255, 255, 0.8);
  --control-solid: rgba(255, 255, 255, 0.7);
  --surface-soft: rgba(255, 255, 255, 0.55);
  --code-inline-bg: rgba(15, 118, 110, 0.08);
  --code-block-bg: #12201b;
  --code-block-fg: #dff7ef;
  --tab-active-bg: var(--ink);
  --tab-active-fg: #ffffff;
  --toast-bg: #14201b;
  --toast-fg: #ffffff;
  --accent-soft: rgba(15, 118, 110, 0.08);
  --accent-border: rgba(15, 118, 110, 0.22);
  --accent-hover-border: rgba(15, 118, 110, 0.45);
  --accent-hover-shadow: 0 10px 24px rgba(15, 118, 110, 0.12);
  --danger-soft: rgba(180, 35, 24, 0.08);
  --danger-border: rgba(180, 35, 24, 0.28);
  --pulse: rgba(15, 118, 110, 0.45);
  --noise-opacity: 0.35;
  --noise-blend: multiply;
  --stage-bg: #f7faf8;
  --dot: rgba(20, 32, 27, 0.12);
  --node-bg: rgba(255, 255, 255, 0.94);
  --node-shadow: 0 10px 24px rgba(20, 32, 27, 0.08);
  --node-active-border: rgba(15, 118, 110, 0.55);
  --node-active-ring: rgba(15, 118, 110, 0.12);
  --node-done-border: rgba(22, 101, 52, 0.45);
  --node-failed-border: rgba(180, 35, 24, 0.45);
  --node-blocked-border: rgba(180, 83, 9, 0.55);
  --handle-border: #ffffff;
  --minimap-idle: #94a3b8;
}

:root[data-theme="dark"] {
  color-scheme: dark;
  --ink: #e8f3ee;
  --muted: #b7c7c0;
  --paper: #101816;
  --paper-2: #0c1210;
  --page-top: #0d1513;
  --panel: rgba(22, 36, 32, 0.78);
  --panel-strong: rgba(16, 26, 23, 0.92);
  --line: rgba(232, 243, 238, 0.14);
  --accent: #2dd4bf;
  --accent-2: #fbbf24;
  --danger: #f87171;
  --ok: #4ade80;
  --on-accent: #06221e;
  --shadow: 0 18px 50px rgba(0, 0, 0, 0.38);
  --wash-accent: rgba(45, 212, 191, 0.16);
  --wash-warm: rgba(251, 191, 36, 0.1);
  --chip-bg: rgba(255, 255, 255, 0.06);
  --tabs-bg: rgba(255, 255, 255, 0.05);
  --control-bg: rgba(8, 14, 12, 0.55);
  --control-solid: rgba(8, 14, 12, 0.45);
  --surface-soft: rgba(255, 255, 255, 0.04);
  --code-inline-bg: rgba(45, 212, 191, 0.14);
  --code-block-bg: #07110e;
  --code-block-fg: #dff7ef;
  --tab-active-bg: #e8f3ee;
  --tab-active-fg: #10201b;
  --toast-bg: #e8f3ee;
  --toast-fg: #10201b;
  --accent-soft: rgba(45, 212, 191, 0.14);
  --accent-border: rgba(45, 212, 191, 0.32);
  --accent-hover-border: rgba(45, 212, 191, 0.55);
  --accent-hover-shadow: 0 10px 24px rgba(0, 0, 0, 0.28);
  --danger-soft: rgba(248, 113, 113, 0.12);
  --danger-border: rgba(248, 113, 113, 0.4);
  --pulse: rgba(45, 212, 191, 0.45);
  --noise-opacity: 0.16;
  --noise-blend: overlay;
  --stage-bg: #0e1614;
  --dot: rgba(232, 243, 238, 0.14);
  --node-bg: rgba(18, 32, 28, 0.96);
  --node-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
  --node-active-border: rgba(45, 212, 191, 0.7);
  --node-active-ring: rgba(45, 212, 191, 0.2);
  --node-done-border: rgba(74, 222, 128, 0.5);
  --node-failed-border: rgba(248, 113, 113, 0.55);
  --node-blocked-border: rgba(251, 191, 36, 0.7);
  --handle-border: #10201b;
  --minimap-idle: #64748b;
}

* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; }
body {
  color: var(--ink);
  font-family: var(--font-body);
  background:
    radial-gradient(1200px 600px at 10% -10%, var(--wash-accent), transparent 55%),
    radial-gradient(900px 500px at 100% 0%, var(--wash-warm), transparent 50%),
    linear-gradient(180deg, var(--page-top) 0%, var(--paper) 40%, var(--paper-2) 100%);
  background-attachment: fixed;
}

body::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: var(--noise-opacity);
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.45'/%3E%3C/svg%3E");
  mix-blend-mode: var(--noise-blend);
}

.shell {
  width: min(920px, calc(100% - 2rem));
  margin: 0 auto;
  padding: 2.5rem 0 7rem;
  position: relative;
  z-index: 1;
}

.hero {
  margin-bottom: 2rem;
  animation: rise 0.7s ease both;
}

.brand {
  font-family: var(--font-display);
  font-size: clamp(2.4rem, 6vw, 4rem);
  line-height: 0.95;
  letter-spacing: -0.03em;
  margin: 0 0 0.75rem;
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
  font-family: "IBM Plex Mono", ui-monospace, monospace;
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
  font-family: "IBM Plex Mono", ui-monospace, monospace;
  font-size: 0.86em;
  background: var(--code-inline-bg);
  padding: 0.1rem 0.35rem;
  border-radius: 6px;
}

.stack { display: grid; gap: 1rem; }

.tabs {
  display: inline-flex;
  gap: 0.35rem;
  padding: 0.3rem;
  margin: 1.25rem 0 1rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--tabs-bg);
  backdrop-filter: blur(8px);
}
.tab-btn {
  border: 0;
  background: transparent;
  color: var(--muted);
  border-radius: 999px;
  padding: 0.55rem 1rem;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
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
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 1.15rem 1.25rem;
  backdrop-filter: blur(10px);
  box-shadow: var(--shadow);
  animation: rise 0.55s ease both;
}

.block.diff-added { box-shadow: inset 3px 0 0 var(--ok), var(--shadow); }
.block.diff-edited { box-shadow: inset 3px 0 0 var(--accent-2), var(--shadow); }
.block.plan-ref-focus {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
  background: var(--accent-soft);
}

.workflow h3 {
  margin: 0 0 0.45rem;
  font-family: var(--font-display);
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
  letter-spacing: -0.02em;
  margin: 0 0 0.55rem;
}
.rich p, .rich li { line-height: 1.55; color: var(--ink); }
.rich p { margin: 0 0 0.75rem; }
.rich ul, .rich ol { margin: 0 0 0.75rem; padding-left: 1.2rem; }
.rich code, .code-block code {
  font-family: "IBM Plex Mono", ui-monospace, monospace;
  font-size: 0.9em;
}
.rich code {
  background: var(--code-inline-bg);
  padding: 0.1rem 0.35rem;
  border-radius: 0.35rem;
}
.code-block {
  margin: 0;
  overflow: auto;
  padding: 0.9rem 1rem;
  border-radius: 12px;
  background: var(--code-block-bg);
  color: var(--code-block-fg);
}
.mermaid-diagram {
  margin: 0 0 0.85rem;
  padding: 0.85rem 1rem;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--panel-strong);
  overflow: auto;
}
.mermaid-diagram .mermaid {
  margin: 0;
  white-space: pre-wrap;
  color: var(--muted);
}
.mermaid-diagram svg {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
}
.mermaid-error {
  margin: 0.65rem 0 0;
  color: var(--danger);
  font-size: 0.85rem;
}

.phase { display: grid; grid-template-columns: 18px 1fr; gap: 0.9rem; }
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
  font-size: 1.25rem;
}
.phase-status {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--muted);
}

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
  border-radius: 14px;
  padding: 0.9rem;
  cursor: pointer;
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}
.choice-option:hover:not(:disabled) {
  transform: translateY(-2px);
  border-color: var(--accent-hover-border);
  box-shadow: var(--accent-hover-shadow);
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
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 0.7rem 0.8rem;
  background: var(--control-bg);
  color: var(--ink);
  font: inherit;
}
textarea { min-height: 88px; resize: vertical; }

.button-row { display: flex; gap: 0.6rem; flex-wrap: wrap; }
.btn {
  border: 1px solid var(--line);
  background: var(--control-bg);
  color: var(--ink);
  border-radius: 999px;
  padding: 0.65rem 1rem;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease, background 0.15s ease;
}
.btn:hover:not(:disabled) { transform: translateY(-1px); }
.btn:disabled { opacity: 0.55; cursor: default; }
.btn.primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
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

.review-bar {
  position: fixed;
  left: 50%;
  bottom: 1rem;
  transform: translateX(-50%);
  width: min(920px, calc(100% - 2rem));
  display: flex;
  gap: 0.6rem;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 0.85rem;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--panel-strong);
  color: var(--ink);
  backdrop-filter: blur(14px);
  box-shadow: var(--shadow);
  z-index: 5;
  animation: rise 0.5s ease both;
}
.review-bar .actions { display: flex; gap: 0.45rem; flex-wrap: wrap; }
.review-note {
  flex: 1;
  min-width: 140px;
  border: 0;
  background: transparent;
  padding: 0.4rem 0.6rem;
  font: inherit;
}

.toast {
  position: fixed;
  top: 1rem;
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
  .review-bar { border-radius: 18px; flex-direction: column; align-items: stretch; }
  .review-bar .actions { justify-content: stretch; }
  .review-bar .actions .btn { flex: 1; }
}
`

function clientScript(
  mode: 'watch' | 'review',
  executionActive: boolean,
  theme: RenderTheme,
): string {
  return `
(() => {
  const mode = ${JSON.stringify(mode)};
  const interactionsLocked = ${JSON.stringify(executionActive)};
  let currentAccent = ${JSON.stringify(theme.accent)};
  const toast = document.getElementById('toast');
  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1600);
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

  function applyTheme(payload) {
    if (!payload || !payload.accent) return;
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
    window.dispatchEvent(new CustomEvent('living-plan-theme', { detail: payload }));
  }

  async function putAccent(accent) {
    const response = await fetch('/api/theme', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accent }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Failed to save accent');
    }
    const payload = await response.json();
    applyTheme(payload.theme || { accent });
    showToast('Accent saved');
  }

  applyTheme(${JSON.stringify({ accent: theme.accent, css: accentCssCustomProperties(theme.accent) })});

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

  document.querySelectorAll('[data-tab-jump]').forEach((button) => {
    button.addEventListener('click', () => {
      activateTab(button.getAttribute('data-tab-jump') || 'workflow');
    });
  });

  function focusPlanRef(ref) {
    if (!ref) return;
    activateTab('plan');
    const section = document.querySelector('[data-plan-ref="' + CSS.escape(ref) + '"]');
    if (!section) {
      showToast('No plan section for this step');
      return;
    }
    document.querySelectorAll('.plan-ref-focus').forEach((node) => node.classList.remove('plan-ref-focus'));
    section.classList.add('plan-ref-focus');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        section.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  }

  document.querySelectorAll('[data-plan-jump]').forEach((button) => {
    button.addEventListener('click', () => {
      focusPlanRef(button.getAttribute('data-plan-jump'));
    });
  });

  window.livingPlanFocusPlanRef = focusPlanRef;

  try {
    let saved = localStorage.getItem('living-plan-tab');
    if (saved === 'execution') saved = 'workflow';
    const preferred = ${JSON.stringify(executionActive)} ? 'workflow' : (saved || 'plan');
    if (preferred) activateTab(preferred);
  } catch {}

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

  document.querySelectorAll('[data-choice-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (interactionsLocked) return;
      const id = button.getAttribute('data-choice-id');
      const optionId = button.getAttribute('data-option-id');
      const label = button.getAttribute('data-option-label');
      if (!id || !optionId || !label) return;
      await postJson('/api/interactions/' + encodeURIComponent(id), {
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
    });
  });

  document.querySelectorAll('[data-approve-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (interactionsLocked) return;
      const id = button.getAttribute('data-approve-id');
      const approved = button.getAttribute('data-approved') === 'true';
      if (!id) return;
      const note = document.querySelector('[data-approve-note="' + id + '"]');
      await postJson('/api/interactions/' + encodeURIComponent(id), {
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
  });

  document.querySelectorAll('form[data-form-id]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (interactionsLocked) return;
      const id = form.getAttribute('data-form-id');
      if (!id) return;
      const data = new FormData(form);
      const values = {};
      data.forEach((value, key) => {
        values[key] = typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value)) && form.querySelector('[name="' + key + '"][type="number"]')
          ? Number(value)
          : value;
      });
      await postJson('/api/interactions/' + encodeURIComponent(id), {
        kind: 'form',
        id,
        values,
      });
      form.querySelectorAll('input, textarea, select, button').forEach((node) => {
        node.disabled = true;
      });
      markState(id, 'Submitted');
      showToast('Form submitted');
    });
  });

  document.querySelectorAll('form[data-questions-id]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (interactionsLocked) return;
      const id = form.getAttribute('data-questions-id');
      if (!id) return;
      const data = new FormData(form);
      const answers = {};
      data.forEach((value, key) => {
        answers[key] = String(value);
      });
      await postJson('/api/interactions/' + encodeURIComponent(id), {
        kind: 'questions',
        id,
        answers,
      });
      form.querySelectorAll('textarea, button').forEach((node) => {
        node.disabled = true;
      });
      markState(id, 'Answers sent');
      showToast('Answers sent');
    });
  });

  if (mode === 'review') {
    document.querySelectorAll('[data-review-decision]').forEach((button) => {
      button.addEventListener('click', async () => {
        const decision = button.getAttribute('data-review-decision');
        const note = document.getElementById('review-note');
        await postJson('/api/review', {
          decision,
          note: note && 'value' in note ? note.value : undefined,
          comments: [],
        });
        showToast('Review ' + decision);
      });
    });
  }

  const source = new EventSource('/api/events');
  source.addEventListener('reload', () => {
    window.location.reload();
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
      markState(payload.id, 'Updated');
    } catch {}
  });
  source.addEventListener('review', () => {
    showToast('Review submitted');
  });
})();
`
}

export function renderPlanPage(options: {
  plan: PlanDocument
  mode: 'watch' | 'review'
  responses: Record<string, InteractionResponse>
  diffs: SectionDiff[]
  iteration: number
  pendingInteractionIds: string[]
  reviewDecision?: ReviewDecision
  execution: ExecutionState
  clientAssets?: ClientAssets | null
  theme: RenderTheme
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

  const locked = Boolean(execution.active)
  const planned = planToExpectedGraph(plan)
  const workflowState = locked ? 'live' : planned ? 'planned' : 'idle'
  const body = plan.blocks
    .map((block, index) => renderBlock(block, index, responses, diffs, locked))
    .join('\n')

  const changed = diffs.filter((diff) => diff.status !== 'unchanged').length
  const hasMermaid = body.includes('class="mermaid-diagram"')
  const assetCss = [
    ...(clientAssets?.cssHrefs ?? []),
    ...(hasMermaid ? (clientAssets?.mermaidCssHrefs ?? []) : []),
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

  return `<!doctype html>
<html lang="en" data-accent="${escapeHtml(theme.accent)}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script>${THEME_BOOTSTRAP}</script>
  <title>${escapeHtml(plan.title)} · Living Plan</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <style>${STYLES}${PROCESSES_PANEL_STYLES}</style>
  ${accentStyleTag(theme.accent)}
  ${assetCss}
</head>
<body>
  ${processesPanelMarkup()}
  <div class="shell">
    <header class="hero">
      <p class="chip" style="width:fit-content;margin:0 0 0.9rem"><span class="live-dot"></span> Living Plan</p>
      <h1 class="brand">${escapeHtml(plan.title)}</h1>
      ${plan.summary ? `<p class="lede">${escapeHtml(plan.summary)}</p>` : ''}
      <div class="meta-row">
        <span class="chip">Mode <strong>${escapeHtml(mode)}</strong></span>
        ${plan.agent ? `<span class="chip">Agent <strong>${escapeHtml(plan.agent)}</strong></span>` : ''}
        <span class="chip">Iteration <strong>v${iteration}</strong></span>
        <span class="chip">Pending <strong>${pendingInteractionIds.length}</strong></span>
        <span class="chip">Workflow <strong>${workflowState}</strong></span>
        ${changed ? `<span class="chip">Changed <strong>${changed}</strong></span>` : ''}
        ${reviewDecision ? `<span class="chip">Review <strong>${escapeHtml(reviewDecision)}</strong></span>` : ''}
      </div>
      <div class="tabs" role="tablist" aria-label="Living Plan views">
        <button type="button" class="tab-btn" role="tab" data-tab-target="plan" aria-selected="true">Plan</button>
        <button type="button" class="tab-btn" role="tab" data-tab-target="workflow" aria-selected="false">Workflow</button>
        <button type="button" class="tab-btn" role="tab" data-tab-target="settings" aria-selected="false">Settings</button>
      </div>
    </header>
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
      <div id="execution-root">${executionFallback}</div>
      ${assetJs}
    </section>
    <section class="tab-panel" data-tab-panel="settings" role="tabpanel" hidden>
      <main class="settings-stack">
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
      </main>
    </section>
  </div>
  ${
    mode === 'review' && !reviewDecision && !locked
      ? `<div class="review-bar">
          <input id="review-note" class="review-note" placeholder="Optional overall note for the agent" />
          <div class="actions">
            <button class="btn danger" data-review-decision="deny">Deny</button>
            <button class="btn" data-review-decision="iterate">Iterate</button>
            <button class="btn primary" data-review-decision="approve">Approve</button>
          </div>
        </div>`
      : ''
  }
  <div id="toast" class="toast" role="status"></div>
  <script>${clientScript(mode, locked, theme)}
${processesPanelScript()}</script>
  ${mermaidJs}
</body>
</html>`
}
