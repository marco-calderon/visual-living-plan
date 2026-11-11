/**
 * Edit sits in the plan's toolbar, after the Plan and Workflow tabs and before the versions menu, the
 * way a wiki reads Read · Edit · History. The toolbar stays on screen, so Edit is one click away
 * anywhere in a long plan.
 *
 * A page renders the button only where the plan can be edited: a local plan, or a hosted plan the
 * account owns, never a saved version. client/planMdx.tsx shows it once the plan has rendered, opens
 * and closes the editor from it and from the E key, and marks it: `aria-pressed` while editing, and
 * `data-plan-has-draft` while an unpublished edit is saved on this device. The label the button shows
 * is its accessible name, so it stays "Edit" or "Resume draft" when phones hide it to an icon.
 */

export const PLAN_EDIT_LABEL = 'Edit'
export const PLAN_EDIT_DRAFT_LABEL = 'Resume draft'
/** The key that opens the editor, as Comment uses C. */
export const PLAN_EDIT_KEY = 'E'

/** Lucide `pencil-line`, the icon the React toolbar draws. */
const PENCIL_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 21h8"/><path d="m15 5 4 4"/><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>'

/** The toolbar button for the local plan page, which is server HTML. src/PlanShell.tsx draws the same in React. */
export function planEditButtonHtml(): string {
  return `<button type="button" class="plan-edit-btn" data-plan-edit aria-keyshortcuts="${PLAN_EDIT_KEY}">${PENCIL_ICON}<span class="plan-edit-label">${PLAN_EDIT_LABEL}</span><span class="plan-edit-draft">${PLAN_EDIT_DRAFT_LABEL}</span></button>`
}

/** The tooltip for each state of the button. */
export function planEditTitle(state: { editing: boolean; hasDraft: boolean }): string {
  if (state.editing) return 'Close the editor. The draft stays on this device.'
  if (state.hasDraft) return `Continue the unpublished edit saved on this device (${PLAN_EDIT_KEY})`
  return `Edit this plan (${PLAN_EDIT_KEY})`
}
