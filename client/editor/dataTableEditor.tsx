import {
  addToMarkdownExtension$,
  NESTED_EDITOR_UPDATED_COMMAND,
  NestedLexicalEditor,
  realmPlugin,
  useLexicalNodeRemove,
  useNestedEditorContext,
  type JsxComponentDescriptor,
  type JsxEditorProps,
} from '@mdxeditor/editor'
import { mdxToMarkdown } from 'mdast-util-mdx'
import {
  $getNodeByKey,
  getNearestEditorFromDOMNode,
  HISTORY_PUSH_TAG,
  SKIP_DOM_SELECTION_TAG,
  SKIP_SCROLL_INTO_VIEW_TAG,
} from 'lexical'
import { ArrowUpDown, Check, ChevronDown, ListFilter, Lock, Plus, Search, Table2, Trash2, X, type LucideIcon } from 'lucide-react'
import { useCallback, useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { CardLabel } from '../entries/CardLabel.tsx'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover.tsx'
import { syncFocusedNestedEditor } from './blockHandles.tsx'
import {
  addColumn,
  addRow,
  attributeText,
  cellBlocks,
  COLUMN_FLAGS,
  compactTableHandler,
  readDataTable,
  removeColumn,
  removeRow,
  setCellBlocks,
  setColumnFlag,
  setColumnHeader,
  setTableLabel,
  type ColumnFlag,
  type DataTableColumn,
  type JsxElement,
} from './dataTableMdast.ts'
import { useIsolatedFromEditor } from './isolate.ts'
import { containsLocked, isLockedMdast, lockedAttribute, LockedContext } from './locked.ts'

const FLAG_INFO: Record<ColumnFlag, { label: string; hint: string; Icon: LucideIcon }> = {
  search: { label: 'Search', hint: 'The search field looks in it', Icon: Search },
  sort: { label: 'Sort', hint: 'Its header sorts the rows', Icon: ArrowUpDown },
  // One column filters: turning it on here turns it off on the others.
  filter: { label: 'Filter', hint: 'A select of its values', Icon: ListFilter },
}

type Change = (fn: (table: JsxElement) => JsxElement) => boolean

/**
 * The table as the editor holds it, read where it is now, and a way to change it. A change reads
 * the table at the moment it runs, so a cell's text that reached the table a moment before is kept.
 */
function useTableNode(): { current: () => JsxElement | null; change: Change } {
  const { parentEditor, lexicalNode } = useNestedEditorContext<JsxElement>()
  const current = useCallback(
    () =>
      parentEditor
        .getEditorState()
        .read(() => ($getNodeByKey(lexicalNode.getKey()) as { getMdastNode?: () => JsxElement } | null)?.getMdastNode?.() ?? null),
    [parentEditor, lexicalNode],
  )
  const change = useCallback<Change>(
    (fn) => {
      // A cell being typed in hands its text over first.
      syncFocusedNestedEditor()
      let changed = false
      parentEditor.update(
        () => {
          const node = $getNodeByKey(lexicalNode.getKey()) as {
            getMdastNode?: () => JsxElement
            setMdastNode?: (next: JsxElement) => void
          } | null
          const before = node?.getMdastNode?.()
          if (!node?.setMdastNode || !before) return
          const after = fn(before)
          if (after === before) return
          node.setMdastNode(after)
          changed = true
        },
        // The person is using a control, not typing in the text: leave the caret and the scroll alone.
        { discrete: true, tag: [HISTORY_PUSH_TAG, SKIP_DOM_SELECTION_TAG, SKIP_SCROLL_INTO_VIEW_TAG] },
      )
      // A table inside a card's body passes the change up to that card.
      if (changed) parentEditor.dispatchCommand(NESTED_EDITOR_UPDATED_COMMAND, undefined)
      return changed
    },
    [parentEditor, lexicalNode],
  )
  return { current, change }
}

/** Put the caret in a cell's editor once it is on screen. It appears a frame or two after its row. */
function focusWhenReady(find: () => HTMLElement | null, frames = 12): void {
  const attempt = (left: number) => {
    const element = find()
    if (element) {
      if (element.isContentEditable) {
        const editor = getNearestEditorFromDOMNode(element)
        if (editor) editor.focus(undefined, { defaultSelection: 'rootStart' })
        else element.focus()
      } else element.focus()
      return
    }
    if (left > 0) requestAnimationFrame(() => attempt(left - 1))
  }
  requestAnimationFrame(() => attempt(frames))
}

/** One cell, open for editing: its markdown, tags (a pill, a chip), and all, in an editor of its own. */
function CellEditor({
  row,
  column,
  label,
  current,
}: {
  row: number
  column: number
  label: string
  current: () => JsxElement | null
}) {
  const cell = useRef<HTMLTableCellElement>(null)
  // Backspace in an empty cell would remove the whole table (MDXEditor's nested editor does that). Here it does nothing.
  useEffect(() => {
    const node = cell.current
    if (!node) return
    const guard = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Backspace' || !(event.target instanceof HTMLElement)) return
      if (!event.target.classList.contains('plan-dt-cell-content') || event.target.closest('td') !== node) return
      const text = event.target.innerText
      if (text === '\n' || text === '') {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    node.addEventListener('keydown', guard, true)
    return () => node.removeEventListener('keydown', guard, true)
  }, [])
  return (
    <td ref={cell} className="plan-dt-cell" data-dt-cell={`${row}:${column}`}>
      <NestedLexicalEditor<JsxElement>
        block
        contentEditableProps={{ className: 'plan-dt-cell-content', 'aria-label': label }}
        getContent={(table) => cellBlocks(table, row, column)}
        getUpdatedMdastNode={(table, blocks) => setCellBlocks(current() ?? table, row, column, blocks as never)}
      />
    </td>
  )
}

/** Arrow keys, Home, and End move between a menu's buttons. */
function moveInList(event: KeyboardEvent<HTMLElement>) {
  const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
  const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
  if (at < 0) return
  const step: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, Home: -at, End: buttons.length - 1 - at }
  const delta = step[event.key]
  if (delta === undefined) return
  event.preventDefault()
  buttons[(at + delta + buttons.length) % buttons.length]?.focus()
}

/** A column's options: search, sort, and filter on or off, and remove the column. */
function ColumnMenu({
  column,
  name,
  disabled,
  onFlag,
  onRemove,
}: {
  column: DataTableColumn
  name: string
  disabled: boolean
  onFlag: (flag: ColumnFlag, on: boolean) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  const on = COLUMN_FLAGS.filter((flag) => column[flag])
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="plan-dt-column-button"
        disabled={disabled}
        data-dt-column-menu=""
        aria-label={`${name} column${on.length ? `: ${on.join(', ')}` : ''}. Column options`}
        title="Search, sort, filter, or remove"
      >
        {on.length ? (
          <span className="plan-dt-flags" aria-hidden="true">
            {on.map((flag) => {
              const { Icon } = FLAG_INFO[flag]
              return <Icon key={flag} size={12} strokeWidth={2.25} data-dt-flag-on={flag} />
            })}
          </span>
        ) : null}
        <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent
        className="plan-dt-column-popover"
        side="bottom"
        align="end"
        sideOffset={6}
        collisionPadding={12}
        data-dt-column-popup=""
      >
        <div className="plan-dt-column-popover-head">
          <span className="plan-dt-column-popover-title">{name}</span>
          <code className="plan-dt-column-id" title="The column's id. It stays as it is.">
            {column.id}
          </code>
        </div>
        <div className="plan-dt-column-options" role="group" aria-label={`${name} column options`} onKeyDown={moveInList}>
          {COLUMN_FLAGS.map((flag) => {
            const { label, hint, Icon } = FLAG_INFO[flag]
            return (
              <button
                key={flag}
                type="button"
                className="plan-dt-column-option"
                data-dt-flag={flag}
                aria-pressed={column[flag]}
                onClick={() => onFlag(flag, !column[flag])}
              >
                <Icon size={14} strokeWidth={2} aria-hidden="true" />
                <span className="plan-dt-column-option-text">
                  <span className="plan-dt-column-option-label">{label}</span>
                  <span className="plan-dt-column-option-hint">{hint}</span>
                </span>
                <Check size={14} strokeWidth={2.25} className="plan-dt-column-option-check" aria-hidden="true" />
              </button>
            )
          })}
          <button
            type="button"
            className="plan-dt-column-option plan-dt-column-remove"
            data-dt-remove-column=""
            onClick={() => {
              setOpen(false)
              onRemove()
            }}
          >
            <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
            <span className="plan-dt-column-option-text">
              <span className="plan-dt-column-option-label">Remove column</span>
              <span className="plan-dt-column-option-hint">With its cell in every row</span>
            </span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * `<DataTable>` in the editor, as a table (ADR 0040): the label, a header row that names each
 * column, one row per `<Row>` with each cell editable where it sits, and + bars that add a row
 * and a column, like a markdown table's. The file keeps everything this does not change.
 */
export function DataTableEditor({ mdastNode }: JsxEditorProps) {
  const table = mdastNode as JsxElement
  const shape = useMemo(() => readDataTable(table), [table])
  const { current, change } = useTableNode()
  const remove = useLexicalNodeRemove()
  const insideLocked = useContext(LockedContext)
  const lockedHere = isLockedMdast(table)
  const locked = insideLocked || lockedHere
  const holdsLocked = useMemo(() => containsLocked(table), [table])
  const root = useRef<HTMLElement>(null)
  useIsolatedFromEditor(root)

  // Rows and columns keep their keys while others come and go, so each cell's editor stays with its cell.
  const keys = useRef({ next: 0, rows: [] as string[], columns: [] as string[], named: new Set<string>() })
  const key = () => `k${(keys.current.next += 1)}`
  if (keys.current.rows.length !== shape.rows.length) keys.current.rows = shape.rows.map(key)
  if (keys.current.columns.length !== shape.columns.length) {
    keys.current.columns = shape.columns.map(key)
    keys.current.named.clear()
  }

  const columnName = (index: number) => shape.columns[index]?.header.trim() || `Column ${index + 1}`

  const onAddRow = () => {
    if (!change(addRow)) return
    keys.current.rows.push(key())
    const row = shape.rows.length
    focusWhenReady(() => root.current?.querySelector<HTMLElement>(`[data-dt-cell="${row}:0"] .plan-dt-cell-content`) ?? null)
  }
  const onAddColumn = () => {
    if (!change((node) => addColumn(node))) return
    const fresh = key()
    keys.current.columns.push(fresh)
    // A new column takes its id from the header the person gives it.
    keys.current.named.add(fresh)
    const column = shape.columns.length
    focusWhenReady(() => root.current?.querySelector<HTMLInputElement>(`[data-dt-header="${column}"]`) ?? null)
  }
  const onRemoveRow = (row: number) => {
    if (change((node) => removeRow(node, row))) keys.current.rows.splice(row, 1)
  }
  const onRemoveColumn = (column: number) => {
    if (change((node) => removeColumn(node, column))) {
      const [gone] = keys.current.columns.splice(column, 1)
      if (gone) keys.current.named.delete(gone)
    }
  }
  const onHeader = (column: number, header: string) => {
    const columnKey = keys.current.columns[column]
    change((node) => setColumnHeader(node, column, header, columnKey !== undefined && keys.current.named.has(columnKey)))
  }

  const lockedByPlan = lockedHere && lockedAttribute(table) === true
  const rowCount = shape.rows.length
  return (
    <section
      ref={root}
      className="plan-dt-editor"
      data-editor-entry="DataTable"
      data-locked={locked ? 'true' : undefined}
      aria-disabled={locked || undefined}
    >
      {lockedByPlan ? (
        <div className="plan-editor-locked-note">
          <Lock size={12} strokeWidth={2.25} aria-hidden="true" />
          <span>Locked by the plan · it can be moved, not changed</span>
        </div>
      ) : null}
      <div className="plan-dt-card">
        <div className="plan-dt-head">
          <CardLabel icon={<Table2 size={16} strokeWidth={2} />} className="plan-editor-kicker">
            Data table
          </CardLabel>
          <input
            className="plan-dt-label"
            aria-label="Table label"
            placeholder="Table label"
            value={shape.label}
            disabled={locked}
            data-dt-label=""
            onChange={(event) => change((node) => setTableLabel(node, event.target.value))}
          />
          <span className="plan-dt-count" aria-live="polite">
            {rowCount === 1 ? '1 row' : `${rowCount} rows`}
          </span>
          <button
            type="button"
            className="plan-editor-remove"
            aria-label="Remove data table"
            title={locked ? 'Locked cards cannot be removed' : holdsLocked ? 'It holds a locked card, so it cannot be removed' : 'Remove'}
            disabled={locked || holdsLocked}
            onClick={remove}
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>
        <div className="plan-dt-scroll">
          <div className="plan-dt-grid-line">
            <table className="plan-dt-grid">
              <thead>
                <tr>
                  {shape.columns.map((column, index) => (
                    <th key={keys.current.columns[index]} scope="col" data-dt-column={column.id}>
                      <div className="plan-dt-th">
                        <input
                          className="plan-dt-header"
                          aria-label={`Column ${index + 1} header`}
                          placeholder={`Column ${index + 1}`}
                          // As wide as its text, so a short header makes a narrow column.
                          size={Math.max(6, Math.min(32, (column.header || `Column ${index + 1}`).length + 1))}
                          value={column.header}
                          disabled={locked}
                          data-dt-header={index}
                          onChange={(event) => onHeader(index, event.target.value)}
                        />
                        <ColumnMenu
                          column={column}
                          name={columnName(index)}
                          disabled={locked}
                          onFlag={(flag, on) => change((node) => setColumnFlag(node, index, flag, on))}
                          onRemove={() => onRemoveColumn(index)}
                        />
                      </div>
                    </th>
                  ))}
                  <th className="plan-dt-tools" aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                <LockedContext.Provider value={locked}>
                  {shape.rows.map((_, row) => (
                    <tr key={keys.current.rows[row]} data-dt-row={row}>
                      {shape.columns.map((_, column) => (
                        <CellEditor
                          key={`${keys.current.rows[row]}:${keys.current.columns[column]}`}
                          row={row}
                          column={column}
                          label={`${columnName(column)}, row ${row + 1}`}
                          current={current}
                        />
                      ))}
                      <td className="plan-dt-tools">
                        <button
                          type="button"
                          className="plan-dt-remove-row"
                          aria-label={`Remove row ${row + 1}`}
                          title="Remove this row"
                          disabled={locked}
                          data-dt-remove-row={row}
                          onClick={() => onRemoveRow(row)}
                        >
                          <X size={14} strokeWidth={2} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </LockedContext.Provider>
                {shape.columns.length === 0 ? (
                  <tr>
                    <td className="plan-dt-empty">No columns yet. Add one with the + on the right.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            {locked ? null : (
              <button
                type="button"
                className="plan-dt-add plan-dt-add-column"
                aria-label="Add a column"
                title="Add a column"
                data-dt-add-column=""
                onClick={onAddColumn}
              >
                <Plus size={12} strokeWidth={2.25} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        {locked ? null : (
          <button
            type="button"
            className="plan-dt-add plan-dt-add-row"
            aria-label="Add a row"
            title="Add a row"
            data-dt-add-row=""
            onClick={onAddRow}
          >
            <Plus size={12} strokeWidth={2.25} aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  )
}

/**
 * The editor writes a `<DataTable>` as plan files do, one column, row, or line of cells per line
 * (compactTableHandler), so an edit to one cell does not spread the whole table out over blank lines.
 */
export const dataTableMarkdownPlugin = realmPlugin({
  init(realm) {
    const flowElement = (mdxToMarkdown().extensions ?? [])
      .map((extension) => extension.handlers?.mdxJsxFlowElement)
      .find((handler) => handler !== undefined)
    if (!flowElement) return
    realm.pubIn({ [addToMarkdownExtension$]: { handlers: { mdxJsxFlowElement: compactTableHandler(flowElement) } } })
  },
})

/** The editor's descriptor for `<DataTable>`. Its columns, rows, and cells are edited inside it, never as tags of their own. */
export const dataTableDescriptor: JsxComponentDescriptor = {
  name: 'DataTable',
  kind: 'flow',
  props: [{ name: 'label', type: 'string' }],
  hasChildren: true,
  Editor: DataTableEditor,
}

/** A pill's tones, in the order its dot steps through them. */
const PILL_TONES = ['neutral', 'success', 'warning', 'danger'] as const

function pillTone(value: string): (typeof PILL_TONES)[number] {
  return (PILL_TONES as readonly string[]).includes(value) ? (value as (typeof PILL_TONES)[number]) : 'neutral'
}

/**
 * `<Pill>` and `<Chip>`, the labels a cell holds most, drawn as the page draws them with their
 * text editable in place. A pill's dot steps through its tones. The same editor shows them in prose.
 */
function LabelEditor({ mdastNode, kind }: { mdastNode: JsxElement; kind: 'pill' | 'chip' }) {
  const { parentEditor, lexicalNode } = useNestedEditorContext<JsxElement>()
  const locked = useContext(LockedContext)
  const box = useRef<HTMLSpanElement>(null)
  useIsolatedFromEditor(box)
  // A label is one line: Enter would start a second one, which the label cannot hold.
  useEffect(() => {
    const node = box.current
    if (!node) return
    const guard = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Enter' || !(event.target instanceof HTMLElement)) return
      if (event.target.closest('[data-editor-label]') !== node || event.metaKey || event.ctrlKey) return
      event.preventDefault()
      event.stopPropagation()
    }
    node.addEventListener('keydown', guard, true)
    return () => node.removeEventListener('keydown', guard, true)
  }, [])
  const tone = pillTone(attributeText(mdastNode, 'tone').trim())
  const nextTone = PILL_TONES[(PILL_TONES.indexOf(tone) + 1) % PILL_TONES.length]!
  const stepTone = () => {
    parentEditor.update(
      () => {
        const node = $getNodeByKey(lexicalNode.getKey()) as { getMdastNode?: () => JsxElement; setMdastNode?: (next: JsxElement) => void } | null
        const current = node?.getMdastNode?.()
        if (!current || !node?.setMdastNode) return
        const attributes = current.attributes.filter((item) => !(item.type === 'mdxJsxAttribute' && item.name === 'tone'))
        const at = current.attributes.findIndex((item) => item.type === 'mdxJsxAttribute' && item.name === 'tone')
        attributes.splice(at < 0 ? attributes.length : at, 0, { type: 'mdxJsxAttribute', name: 'tone', value: nextTone })
        node.setMdastNode({ ...current, attributes } as JsxElement)
      },
      { discrete: true, tag: [HISTORY_PUSH_TAG, SKIP_DOM_SELECTION_TAG, SKIP_SCROLL_INTO_VIEW_TAG] },
    )
    parentEditor.dispatchCommand(NESTED_EDITOR_UPDATED_COMMAND, undefined)
  }
  return (
    <span
      ref={box}
      className={kind === 'pill' ? 'plan-pill plan-editor-label' : 'plan-chip plan-editor-label'}
      data-tone={kind === 'pill' ? tone : undefined}
      data-editor-label={kind}
    >
      {kind === 'pill' ? (
        <button
          type="button"
          className="plan-editor-pill-tone"
          disabled={locked}
          data-pill-tone=""
          aria-label={`Tone ${tone}. Change to ${nextTone}`}
          title={`Tone: ${tone} · click for ${nextTone}`}
          onClick={stepTone}
        />
      ) : null}
      <NestedLexicalEditor<JsxElement>
        block={mdastNode.type === 'mdxJsxFlowElement'}
        contentEditableProps={{ className: 'plan-editor-label-text', 'aria-label': kind === 'pill' ? 'Pill text' : 'Chip text' }}
        getContent={(node) => node.children}
        getUpdatedMdastNode={(node, children) => ({ ...node, children }) as JsxElement}
      />
    </span>
  )
}

function PillEditor({ mdastNode }: JsxEditorProps) {
  return <LabelEditor mdastNode={mdastNode as JsxElement} kind="pill" />
}

function ChipEditor({ mdastNode }: JsxEditorProps) {
  return <LabelEditor mdastNode={mdastNode as JsxElement} kind="chip" />
}

export const labelDescriptors: JsxComponentDescriptor[] = [
  { name: 'Pill', kind: 'text', props: [{ name: 'tone', type: 'string' }], hasChildren: true, Editor: PillEditor },
  { name: 'Chip', kind: 'text', props: [], hasChildren: true, Editor: ChipEditor },
]
