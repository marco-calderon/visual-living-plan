import type { ClientAssets } from './assets'
import type { ExecutionState } from './execution'
import { planSourceFlags, renderPlanStaticHtml } from './planMdx/source'
import { fileVersionName, fileVersionSeq, fileVersionText } from './fileVersion'
import type { PlanSnapshotRecord } from './planSnapshots'
import type { PlanMode } from './processRecord'
import { clientLogScript } from './clientLog'
import { faviconLink } from './favicon'
import { PROCESSES_PANEL_STYLES, processesPanelMarkup, processesPanelScript } from './processesPanel'
import { accentCssCustomProperties, PAGE_WIDTH_OPTIONS, type PageWidth } from './theme'
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
import { buildPlanToc, renderPlanTocHtml } from './planToc'
import { planToExpectedGraph, withPlannedWorkflow } from './workflow'
import { changelogSectionHtml, type ChangelogRelease } from './changelog'
import { appearanceSettingsHtml } from './appearanceSettings'
import { planPageStyles } from './planPageStyles.ts'

export type RenderTheme = {
  accent: string
  pageWidth?: PageWidth
  diffsTheme?: string
  diffsThemes?: DiffsThemePreset[]
  wrapCode?: boolean
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
    if (typeof window.showPlanToast === 'function') {
      window.showPlanToast(message);
      return;
    }
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1600);
  }

  setTimeout(() => {
    if (document.documentElement.dataset.planChrome === 'react') return;
  const planDetails = document.querySelector('[data-plan-details]');
  const planDetailsBtn = document.querySelector('[data-plan-details-toggle]');
  const planCard = document.querySelector('[data-plan-card]');
  let planDetailsOpen = false;
  let planDetailsCloseTimer = 0;
  let planDetailsCloseListener = null;
  function cancelPlanDetailsClose() {
    window.clearTimeout(planDetailsCloseTimer);
    planDetailsCloseTimer = 0;
    if (planDetailsCloseListener && planCard) {
      planCard.removeEventListener('transitionend', planDetailsCloseListener);
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
      void planCard.getBoundingClientRect();
      planCard.setAttribute('data-open', '');
      return;
    }
    planCard.removeAttribute('data-open');
    planCard.setAttribute('data-closed', '');
    planDetailsCloseListener = (event) => {
      if (event.target !== planCard || event.propertyName !== 'opacity') return;
      finishPlanDetailsClose();
    };
    planCard.addEventListener('transitionend', planDetailsCloseListener);
    planDetailsCloseTimer = window.setTimeout(finishPlanDetailsClose, 280);
  }
  let planDetailsPinned = false;
  let planDetailsHoverTimer = 0;
  function closePlanDetailsSoon() {
    window.clearTimeout(planDetailsHoverTimer);
    planDetailsHoverTimer = window.setTimeout(() => {
      if (!planDetailsPinned) setPlanDetails(false);
    }, 160);
  }
  if (planDetails && planDetailsBtn && planCard) {
    planDetailsBtn.addEventListener('mouseenter', () => {
      window.clearTimeout(planDetailsHoverTimer);
      setPlanDetails(true);
    });
    planDetailsBtn.addEventListener('mouseleave', closePlanDetailsSoon);
    planCard.addEventListener('mouseenter', () => {
      window.clearTimeout(planDetailsHoverTimer);
    });
    planCard.addEventListener('mouseleave', closePlanDetailsSoon);
    planDetailsBtn.addEventListener('click', () => {
      if (planDetailsPinned) {
        planDetailsPinned = false;
        setPlanDetails(false);
        return;
      }
      planDetailsPinned = true;
      setPlanDetails(true);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      planDetailsPinned = false;
      setPlanDetails(false);
    });
    document.addEventListener('click', (event) => {
      if (!planDetailsOpen) return;
      if (event.target instanceof Node && planDetails.contains(event.target)) return;
      planDetailsPinned = false;
      setPlanDetails(false);
    });
  }
  }, 0);

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
    const detailsBtn = document.querySelector('[data-plan-details-toggle]');
    if (detailsBtn) {
      detailsBtn.setAttribute('aria-label', count > 0 ? 'Plan details, ' + count + ' pending' : 'Plan details');
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

  const pageWidths = ${JSON.stringify(PAGE_WIDTH_OPTIONS.map((option) => option.id))};
  const pageWidthLabels = ${JSON.stringify(Object.fromEntries(PAGE_WIDTH_OPTIONS.map((option) => [option.id, option.label])))};
  let currentPageWidth = ${JSON.stringify(theme.pageWidth || 'default')};
  let currentDiffsTheme = ${JSON.stringify(theme.diffsTheme || DEFAULT_DIFFS_THEME)};

  function applyLayout(pageWidth) {
    currentPageWidth = pageWidths.indexOf(pageWidth) >= 0 ? pageWidth : 'default';
    document.documentElement.dataset.layout = currentPageWidth;
    document.body.classList.remove('layout-narrow', 'layout-default', 'layout-wide', 'layout-full');
    document.body.classList.add('layout-' + currentPageWidth);
    document.querySelectorAll('[data-page-width]').forEach((node) => {
      const id = node.getAttribute('data-page-width');
      node.setAttribute('aria-checked', id === currentPageWidth ? 'true' : 'false');
    });
    syncTocDock();
  }

  function applyWrapCode(wrapCode) {
    const on = wrapCode === true || wrapCode === 'true';
    document.documentElement.dataset.wrapCode = on ? 'true' : 'false';
    if (document.documentElement.dataset.codeWrapControl === 'react') return;
    const control = document.querySelector('[data-code-wrap]');
    if (!control) return;
    control.setAttribute('aria-checked', on ? 'true' : 'false');
    const thumb = control.querySelector('.plan-switch-thumb');
    if (!thumb) return;
    if (on) thumb.setAttribute('data-checked', '');
    else thumb.removeAttribute('data-checked');
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
    if (payload.pageWidth !== undefined) applyLayout(payload.pageWidth);
    if (payload.diffsTheme !== undefined) {
      const selected = document.querySelector('[data-diffs-theme="' + payload.diffsTheme + '"]');
      const label = selected ? selected.getAttribute('data-diffs-theme-label') : payload.diffsTheme;
      applyDiffsTheme(payload.diffsTheme, label);
    }
    if (payload.wrapCode !== undefined) applyWrapCode(payload.wrapCode);
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
    pageWidth: theme.pageWidth || 'default',
    diffsTheme: theme.diffsTheme || DEFAULT_DIFFS_THEME,
    wrapCode: theme.wrapCode === true,
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

  document.addEventListener('click', async (event) => {
    const target = event.target;
    const button = target instanceof Element ? target.closest('[data-code-wrap]') : null;
    if (!(button instanceof HTMLElement)) return;
    if (document.documentElement.dataset.codeWrapControl === 'react') return;
    const next = document.documentElement.dataset.wrapCode !== 'true';
    const previous = !next;
    applyWrapCode(next);
    try {
      await putTheme({ wrapCode: next });
      showToast(next ? 'Code wraps' : 'Code scrolls');
    } catch (error) {
      applyWrapCode(previous);
      showToast(error instanceof Error ? error.message : 'Could not save code wrap');
    }
  });

  document.querySelectorAll('[data-page-width]').forEach((button) => {
    button.addEventListener('click', async () => {
      const next = button.getAttribute('data-page-width');
      if (!next || next === currentPageWidth) return;
      const previous = currentPageWidth;
      applyLayout(next);
      try {
        await putTheme({ pageWidth: next });
        showToast((pageWidthLabels[next] || 'Page') + ' width');
      } catch (error) {
        applyLayout(previous);
        showToast(error instanceof Error ? error.message : 'Layout update failed');
      }
    });
  });

  setTimeout(() => {
    if (document.documentElement.dataset.planChrome === 'react') return;
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
  }, 0);

  document.addEventListener('click', async (event) => {
    const target = event.target;
    const button = target instanceof Element ? target.closest('[data-diffs-theme]') : null;
    if (!(button instanceof HTMLElement)) return;
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

  function activateTab(target) {
    document.querySelectorAll('[data-tab-target]').forEach((node) => {
      node.setAttribute('aria-selected', node.getAttribute('data-tab-target') === target ? 'true' : 'false');
    });
    document.querySelectorAll('[data-tab-panel]').forEach((panel) => {
      panel.hidden = panel.getAttribute('data-tab-panel') !== target;
    });
    try { localStorage.setItem('living-plan-tab', target || 'plan'); } catch {}
    if (target !== 'workflow') window.livingPlanPendingWorkflowFocus = null;
    if (target === 'workflow') {
      requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    }
    updateTocCurrent();
  }

  document.querySelectorAll('[data-tab-target]').forEach((button) => {
    button.addEventListener('click', () => {
      const tab = button.getAttribute('data-tab-target');
      if (tab === 'plan' || tab === 'workflow' || tab === 'settings') focusPageTab(tab);
      else activateTab(tab);
    });
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const tabJump = target.closest('[data-tab-jump]');
    if (!tabJump) return;
    const tab = tabJump.getAttribute('data-tab-jump') || 'workflow';
    if (tab === 'plan' || tab === 'workflow' || tab === 'settings') focusPageTab(tab);
    else activateTab(tab);
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

  function workflowRefFromHash(hash) {
    const decoded = decodeToken(hash);
    if (!decoded.startsWith('workflow/')) return '';
    return decoded.slice('workflow/'.length);
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
    updateTocCurrent();
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
    window.livingPlanPendingWorkflowFocus = null;
    if (view && view.tab) activateTab(view.tab);
    if (view && typeof view.y === 'number') pinScroll(view.x || 0, view.y);
  }

  function focusWorkflowStep(ref, options) {
    const recordHistory = !options || options.recordHistory !== false;
    const canonical = decodeToken(ref);
    if (!canonical) return;
    if (recordHistory) {
      const hash = '#workflow/' + encodeURIComponent(canonical);
      const next = new URL(window.location.href);
      next.hash = hash;
      const sameEntry = history.state && history.state.livingPlanWorkflow === canonical && location.hash === next.hash;
      if (sameEntry || jumpDepth > 0) return;
      jumpDepth += 1;
      snapshotView();
      history.pushState({ livingPlanWorkflow: canonical }, '', next);
      jumpDepth -= 1;
    }
    highlightPlanTarget(null);
    activateTab('workflow');
    window.livingPlanPendingWorkflowFocus = canonical;
    window.dispatchEvent(new CustomEvent('living-plan-focus-workflow', { detail: { ref: canonical } }));
    updateTocCurrent();
  }

  function focusPageTab(tab, options) {
    const page = tab === 'plan' || tab === 'workflow' || tab === 'settings' ? tab : '';
    if (!page) return;
    const recordHistory = !options || options.recordHistory !== false;
    if (recordHistory) {
      const next = new URL(window.location.href);
      next.hash = '#' + page;
      const sameEntry = history.state && history.state.livingPlanPage === page && location.hash === next.hash;
      if (sameEntry || jumpDepth > 0) return;
      jumpDepth += 1;
      snapshotView();
      history.pushState({ livingPlanPage: page }, '', next);
      jumpDepth -= 1;
    }
    highlightPlanTarget(null);
    window.livingPlanPendingWorkflowFocus = null;
    activateTab(page);
  }

  function focusWorkflowPage(options) {
    focusPageTab('workflow', options);
  }

  function tocIsDocked() {
    const nav = document.getElementById('plan-toc');
    if (!nav) return false;
    return getComputedStyle(nav).getPropertyValue('--toc-dock').trim() === '1';
  }

  function setTocOpen(open) {
    const nav = document.getElementById('plan-toc');
    const toggle = document.querySelector('[data-toc-toggle]');
    const backdrop = document.getElementById('plan-toc-backdrop');
    if (!nav) return;
    const docked = tocIsDocked();
    const shown = docked || open;
    nav.dataset.open = open && !docked ? 'true' : 'false';
    if (shown) {
      nav.removeAttribute('inert');
      nav.removeAttribute('aria-hidden');
    } else {
      nav.setAttribute('inert', '');
      nav.setAttribute('aria-hidden', 'true');
    }
    if (toggle) toggle.setAttribute('aria-expanded', open && !docked ? 'true' : 'false');
    if (backdrop) backdrop.hidden = docked || !open;
    if (open && !docked) nav.focus();
    else if (!open && !docked && toggle instanceof HTMLElement && nav.contains(document.activeElement)) toggle.focus();
  }

  function syncTocDock() {
    const nav = document.getElementById('plan-toc');
    if (!nav) return;
    if (tocIsDocked()) nav.dataset.open = 'false';
    setTocOpen(nav.dataset.open === 'true');
  }

  function updateTocCurrent() {
    const links = [...document.querySelectorAll('#plan-toc a[data-toc]')];
    if (links.length === 0) return;
    const tab = currentView().tab;
    let current = null;
    if (tab === 'workflow') {
      const ref = window.livingPlanPendingWorkflowFocus || '';
      current = links.find((link) => link.getAttribute('data-toc') === 'workflow-step' && link.getAttribute('data-toc-target') === ref)
        || links.find((link) => link.getAttribute('data-toc') === 'workflow')
        || null;
    } else if (tab === 'plan') {
      const line = window.scrollY + 96;
      for (const link of links) {
        if (link.getAttribute('data-toc') !== 'section') continue;
        const section = findPlanTarget(link.getAttribute('data-toc-target') || '');
        if (!section) continue;
        const top = section.getBoundingClientRect().top + window.scrollY;
        if (top <= line) current = link;
      }
      if (!current) current = links.find((link) => link.getAttribute('data-toc') === 'section') || null;
    }
    links.forEach((link) => {
      if (link === current) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
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
    const tocLink = target.closest('#plan-toc a[data-toc]');
    if (tocLink) {
      const kind = tocLink.getAttribute('data-toc');
      const ref = tocLink.getAttribute('data-toc-target') || '';
      event.preventDefault();
      setTocOpen(false);
      if (kind === 'workflow') focusWorkflowPage();
      else if (kind === 'workflow-step' && ref) focusWorkflowStep(ref);
      else if (ref) focusPlanRef(ref);
      return;
    }
    const workflowJump = target.closest('[data-workflow-jump]');
    if (workflowJump) {
      if (document.documentElement.dataset.comments === 'on') return;
      const ref = workflowJump.getAttribute('data-workflow-jump');
      if (!ref) return;
      event.preventDefault();
      focusWorkflowStep(ref);
      return;
    }
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
    if ((state.livingPlanPage === 'plan' || state.livingPlanPage === 'workflow' || state.livingPlanPage === 'settings') && !(state.livingPlanView && state.livingPlanView.captured)) {
      focusPageTab(state.livingPlanPage, { recordHistory: false });
      return;
    }
    if (state.livingPlanView && state.livingPlanView.captured) {
      restoreView(state.livingPlanView);
      if (state.livingPlanView.tab === 'workflow' && state.livingPlanWorkflow) {
        window.livingPlanPendingWorkflowFocus = state.livingPlanWorkflow;
        window.dispatchEvent(new CustomEvent('living-plan-focus-workflow', { detail: { ref: state.livingPlanWorkflow } }));
      }
      updateTocCurrent();
      return;
    }
    if (state.livingPlanWorkflow) {
      focusWorkflowStep(state.livingPlanWorkflow, { recordHistory: false });
      return;
    }
    const workflowRef = workflowRefFromHash(location.hash);
    if (workflowRef) {
      focusWorkflowStep(workflowRef, { recordHistory: false });
      return;
    }
    if (location.hash === '#workflow' || location.hash === '#plan' || location.hash === '#settings') {
      focusPageTab(location.hash.slice(1), { recordHistory: false });
      return;
    }
    if (location.hash && findPlanTarget(location.hash)) {
      focusPlanRef(location.hash, { recordHistory: false, instant: true });
      return;
    }
    highlightPlanTarget(null);
  });

  window.livingPlanFocusPlanRef = focusPlanRef;
  window.livingPlanWorkflowFocusMissed = function () {
    showToast('No workflow step for this section');
  };

  try {
    let saved = localStorage.getItem('living-plan-tab');
    if (saved === 'execution') saved = 'workflow';
    const preferred = ${JSON.stringify(executionActive)} ? 'workflow' : (saved || 'plan');
    if (preferred) activateTab(preferred);
  } catch {}

  const openingWorkflowRef = workflowRefFromHash(location.hash);
  if (openingWorkflowRef) {
    focusWorkflowStep(openingWorkflowRef, { recordHistory: false });
  } else if (location.hash === '#workflow' || location.hash === '#plan' || location.hash === '#settings') {
    focusPageTab(location.hash.slice(1), { recordHistory: false });
  } else if (!interactionsLocked && location.hash && findPlanTarget(location.hash)) {
    focusPlanRef(location.hash, { recordHistory: false, instant: true });
  }

  document.querySelector('[data-toc-toggle]')?.addEventListener('click', () => {
    const nav = document.getElementById('plan-toc');
    setTocOpen(nav?.dataset.open !== 'true');
  });
  document.getElementById('plan-toc-backdrop')?.addEventListener('click', () => setTocOpen(false));
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const nav = document.getElementById('plan-toc');
    if (!nav || nav.dataset.open !== 'true' || tocIsDocked()) return;
    setTocOpen(false);
  });
  const tocStepStatuses = { pending: true, active: true, done: true, blocked: true, failed: true };
  let tocExecution = null;
  function readTocExecution() {
    const node = document.getElementById('living-plan-bootstrap');
    if (!node || !node.textContent) return null;
    try { return JSON.parse(node.textContent); } catch { return null; }
  }
  function tocProgressNodes(state) {
    const planned = state && state.planned && Array.isArray(state.planned.nodes) ? state.planned.nodes : [];
    const live = state && state.graph && Array.isArray(state.graph.nodes) ? state.graph.nodes : [];
    const liveById = new Map(live.map((node) => [node.id, node]));
    const seen = new Set();
    const nodes = [];
    for (const node of planned) {
      seen.add(node.id);
      const overlay = liveById.get(node.id);
      if (!overlay) {
        nodes.push(node);
        continue;
      }
      nodes.push({
        id: node.id,
        status: overlay.status || node.status,
        planRef: overlay.planRef || node.planRef,
      });
    }
    for (const node of live) {
      if (!seen.has(node.id)) nodes.push(node);
    }
    return nodes;
  }
  function applyTocStepProgress(state) {
    if (!state) return;
    const links = document.querySelectorAll('#plan-toc a[data-toc-step]');
    if (!links.length) return;
    const byTarget = new Map();
    for (const node of tocProgressNodes(state)) {
      const status = node && node.status;
      if (!status || !tocStepStatuses[status]) continue;
      if (node.id) byTarget.set(node.id, status);
      if (node.planRef) byTarget.set(node.planRef, status);
    }
    links.forEach((link) => {
      const status = byTarget.get(link.getAttribute('data-toc-target') || '');
      if (!status) return;
      const icon = 'phase-' + status;
      if (link.getAttribute('data-toc-icon') !== icon) link.setAttribute('data-toc-icon', icon);
    });
  }
  tocExecution = readTocExecution();
  applyTocStepProgress(tocExecution);
  window.addEventListener('living-plan-toc', () => {
    updateTocCurrent();
    applyTocStepProgress(tocExecution);
  });
  let tocScrollTick = 0;
  window.addEventListener('scroll', () => {
    if (tocScrollTick) return;
    tocScrollTick = requestAnimationFrame(() => {
      tocScrollTick = 0;
      updateTocCurrent();
    });
  }, { passive: true });
  window.addEventListener('resize', () => syncTocDock());
  syncTocDock();
  updateTocCurrent();

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
    if (event.defaultPrevented) return;
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || interactionsLocked) return;
    const formId = form.getAttribute('data-form-id');
    const questionsId = form.getAttribute('data-questions-id');
    if (!formId && !questionsId) return;
    event.preventDefault();
    if (formId) {
      const values = {};
      const checkboxNames = new Set();
      for (const element of form.elements) {
        if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLTextAreaElement) && !(element instanceof HTMLSelectElement)) continue;
        const isButton = element instanceof HTMLInputElement && (element.type === 'submit' || element.type === 'button');
        if (!element.name || isButton) continue;
        if (element instanceof HTMLInputElement && element.type === 'checkbox') {
          checkboxNames.add(element.name);
          continue;
        }
        if (element instanceof HTMLInputElement && element.type === 'number') {
          if (element.value === '') continue;
          values[element.name] = Number(element.value);
          continue;
        }
        values[element.name] = element.value;
      }
      checkboxNames.forEach((name) => {
        const boxes = [];
        for (const element of form.elements) {
          if (element instanceof HTMLInputElement && element.type === 'checkbox' && element.name === name) boxes.push(element);
        }
        const checked = boxes.filter((box) => box.checked).map((box) => box.value);
        const single = boxes.length === 1 && boxes[0].value === 'true';
        values[name] = single ? (checked.length ? 'true' : 'false') : checked;
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
        node.style.transition = 'height 200ms var(--ease-out)';
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
      const nextBoot = parsed.querySelector('#living-plan-bootstrap');
      if (nextBoot && nextBoot.textContent) {
        try { tocExecution = JSON.parse(nextBoot.textContent); } catch {}
      }
      const nextToc = parsed.querySelector('#plan-toc-list');
      const tocList = document.querySelector('#plan-toc-list');
      if (nextToc && tocList) {
        tocList.innerHTML = nextToc.innerHTML;
        window.dispatchEvent(new Event('living-plan-toc'));
      }
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
      tocExecution = payload;
      applyTocStepProgress(payload);
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
const FILE_VERSION_ICON = statusIcon('<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>')
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
  const tocHtml = renderPlanTocHtml(buildPlanToc(plan.source))
  const body = `<div id="plan-mdx-root" data-plan-mdx class="${planMdxHref ? 'plan-mdx-pending' : ''}">${staticPlan}</div>`

  const changed = diffs.filter((diff) => diff.status !== 'unchanged').length
  const versionSeq = fileVersionSeq(options.mdxSnapshots ?? [], options.mdxHeadSnapshotId ?? null)
  const versionName = fileVersionName(versionSeq)
  const versionText = fileVersionText(versionSeq)
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
  const layoutMode: PageWidth = theme.pageWidth || 'default'
  const diffsThemeId = theme.diffsTheme || DEFAULT_DIFFS_THEME
  const diffsPresets = theme.diffsThemes?.length
    ? theme.diffsThemes
    : [diffsThemePreset(diffsThemeId)]
  const currentDiffs = diffsThemePreset(diffsThemeId)
  const wrapCode = theme.wrapCode === true
  const savedTo = escapeHtml(configName)
  return `<!doctype html>
<html lang="en" data-plan-host="local" data-accent="${escapeHtml(theme.accent)}" data-layout="${layoutMode}" data-diffs-theme="${escapeHtml(currentDiffs.id)}" data-wrap-code="${wrapCode ? 'true' : 'false'}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${faviconLink}
  <script>${THEME_BOOTSTRAP}</script>
  <title>${escapeHtml(plan.title)} · Living Plan</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>${planPageStyles}${PROCESSES_PANEL_STYLES}</style>
  ${assetCss}
  ${planMdxCss}
  ${accentStyleTag(theme.accent)}
  ${planMdxHref ? '<style>.plan-mdx-pending{display:none}</style><noscript><style>.plan-mdx-pending{display:block}</style></noscript>' : ''}
</head>
<body class="${showReviewBar ? 'has-review-bar ' : ''}layout-${layoutMode}" data-plan-mode="${escapeHtml(mode)}">
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
          <span class="fact" data-file-version title="${escapeHtml(versionName)}" aria-label="${escapeHtml(versionName)}">${FILE_VERSION_ICON}<span class="val" data-file-version-value>${escapeHtml(versionText)}</span></span>
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
  ${tocHtml}
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
      <script>window.__LIVE_PLAN_BASE__ = ${JSON.stringify(basePath)}; window.__LIVE_PLAN_HOST__ = "local";</script>
      <div id="execution-root">${executionFallback}</div>
      ${assetJs}
    </section>
    <section class="tab-panel" data-tab-panel="settings" role="tabpanel" hidden>
      <main class="settings-stack">
        ${options.changelog ? changelogSectionHtml(options.changelog) : ''}
        <section class="block settings-section" data-host-panel="local" data-plan-host="local">
          <div class="settings-kicker">This machine</div>
          <h3>Local plan</h3>
          <p class="settings-copy">This plan is on loopback. Appearance stays in the theme file on this machine. An account is not required.</p>
        </section>
        ${appearanceSettingsHtml({
          accent: theme.accent,
          pageWidth: layoutMode,
          diffsTheme: currentDiffs.id,
          wrapCode,
          presets: theme.presets,
          widths: PAGE_WIDTH_OPTIONS.map((option) => ({ id: option.id, label: option.label })),
          diffsThemes: diffsPresets,
          accentNote: `Saved to <code>${savedTo}</code>. Agents can also run <code>live-plan theme set --accent #hex</code>.`,
          widthNote: `Saved to <code>${savedTo}</code> with the accent settings.`,
          wrapNote: `Saved to <code>${savedTo}</code> as <code>theme.wrapCode</code>.`,
          diffsNote: `Saved to <code>${savedTo}</code> as <code>theme.diffsTheme</code>.`,
        })}
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
