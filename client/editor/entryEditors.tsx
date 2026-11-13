import {
  GenericJsxEditor,
  NESTED_EDITOR_UPDATED_COMMAND,
  NestedLexicalEditor,
  useLexicalNodeRemove,
  useNestedEditorContext,
  type JsxComponentDescriptor,
  type JsxEditorProps,
} from '@mdxeditor/editor'
import { $getNodeByKey, HISTORY_PUSH_TAG, SKIP_DOM_SELECTION_TAG, SKIP_SCROLL_INTO_VIEW_TAG } from 'lexical'
import { Lock, Trash2 } from 'lucide-react'
import type { MdxJsxAttribute, MdxJsxFlowElement, MdxJsxTextElement } from 'mdast-util-mdx-jsx'
import { Fragment, useContext, useId, useMemo, useRef } from 'react'
import { CardLabel } from '../entries/CardLabel.tsx'
import { cx } from '../entries/styles.ts'
import { calloutKind, phaseStatus } from '../entries/types.ts'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.tsx'
import { IconPicker } from './iconPicker.tsx'
import { containsLocked, isLockedMdast, isLockedTag, lockedAttribute, LockedContext } from './locked.ts'
import { dataTableDescriptor, labelDescriptors } from './dataTableEditor.tsx'
import { hasLockedPreview, renderLockedPreview } from './lockedPreview.tsx'
import { StatusPicker } from './statusPicker.tsx'
import { useIsolatedFromEditor } from './isolate.ts'

type JsxNode = MdxJsxFlowElement | MdxJsxTextElement

const CALLOUT_KINDS = ['note', 'tip', 'risk', 'decision', 'warning']
const FIELD_TYPES = ['text', 'number', 'textarea', 'select', 'checkbox', 'stepper']
const CHANGES = ['modified', 'added', 'deleted', 'renamed', 'unchanged']
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
const PARAM_PLACES = ['path', 'query', 'header', 'body', 'cookie']
const RELATIONS = ['1-n', '1-1', 'n-1', 'n-n']
const HEALTHS = ['on-track', 'at-risk', 'off-track']

type PropSpec = {
  name: string
  label: string
  control: 'text' | 'select' | 'flag'
  options?: string[]
  /** Takes the free width of the header row. */
  wide?: boolean
  placeholder?: string
  /** A select that can also be empty ("none"): the attribute is left out. */
  optional?: boolean
  /** Shown only while another attribute has this value, or while this one is set. */
  when?: { name: string; is: string }
}

/** The select item that stands for an attribute left out. */
const NONE = '__none__'

type EntrySpec = {
  /** The tag name the editor sees. */
  tag: string
  label: string
  /** Icon the card label always shows, for cards without an `icon` of their own. */
  icon?: string
  /** The card takes `icon` and `color`: its icon square opens the icon picker. */
  pickIcon?: boolean
  /** The card takes `status`: its status icon opens the status picker. */
  pickStatus?: boolean
  props: PropSpec[]
  hasChildren: boolean
  /** A row inside a card (option, field, item) rather than a card of its own. */
  row?: boolean
}

const ID: PropSpec = { name: 'id', label: 'Id', control: 'text', placeholder: 'id' }

/** A callout's icon tint without a color of its own, for the picker's default swatch. */
const KIND_TINT: Record<string, string> = {
  tip: 'var(--ok)',
  risk: 'var(--danger)',
  warning: 'var(--danger)',
  decision: 'var(--accent-2)',
}

export const ENTRY_SPECS: EntrySpec[] = [
  {
    tag: 'phase',
    label: 'Phase',
    pickStatus: true,
    props: [{ name: 'title', label: 'Title', control: 'text', wide: true, placeholder: 'Phase title' }, ID],
    hasChildren: true,
  },
  {
    tag: 'callout',
    label: 'Callout',
    pickIcon: true,
    props: [
      { name: 'title', label: 'Title', control: 'text', wide: true, placeholder: 'Callout title' },
      { name: 'kind', label: 'Kind', control: 'select', options: CALLOUT_KINDS },
      ID,
    ],
    hasChildren: true,
  },
  {
    tag: 'choice',
    label: 'Choice',
    pickIcon: true,
    props: [{ name: 'prompt', label: 'Prompt', control: 'text', wide: true, placeholder: 'What should the person pick?' }, ID],
    hasChildren: true,
  },
  {
    tag: 'plan-option',
    label: 'Option',
    props: [
      { name: 'label', label: 'Label', control: 'text', wide: true, placeholder: 'Option label' },
      ID,
      { name: 'recommended', label: 'Recommended', control: 'flag' },
    ],
    hasChildren: true,
    row: true,
  },
  {
    tag: 'plan-form',
    label: 'Form',
    pickIcon: true,
    props: [{ name: 'prompt', label: 'Prompt', control: 'text', wide: true, placeholder: 'What should the person fill in?' }, ID],
    hasChildren: true,
  },
  {
    tag: 'field',
    label: 'Field',
    props: [
      { name: 'label', label: 'Label', control: 'text', wide: true, placeholder: 'Field label' },
      { name: 'name', label: 'Name', control: 'text', placeholder: 'name' },
      { name: 'type', label: 'Type', control: 'select', options: FIELD_TYPES },
      { name: 'options', label: 'Options', control: 'text', placeholder: 'a, b, c' },
      { name: 'default', label: 'Default', control: 'text', placeholder: 'default' },
      { name: 'required', label: 'Required', control: 'flag' },
    ],
    hasChildren: false,
    row: true,
  },
  {
    tag: 'questions',
    label: 'Questions',
    pickIcon: true,
    props: [{ name: 'prompt', label: 'Prompt', control: 'text', wide: true, placeholder: 'What should the person answer?' }, ID],
    hasChildren: true,
  },
  {
    tag: 'item',
    label: 'Item',
    // A checklist line's status (ADR 0039). An item that only says `done` shows as done or pending.
    pickStatus: true,
    props: [],
    hasChildren: true,
    row: true,
  },
  {
    tag: 'approve',
    label: 'Approval',
    pickIcon: true,
    props: [{ name: 'prompt', label: 'Prompt', control: 'text', wide: true, placeholder: 'What should the person approve?' }, ID],
    hasChildren: true,
  },
  {
    tag: 'checklist',
    label: 'Checklist',
    icon: 'list',
    props: [{ name: 'title', label: 'Title', control: 'text', wide: true, placeholder: 'Checklist title' }, ID],
    hasChildren: true,
  },
  {
    tag: 'workflow',
    label: 'Workflow',
    icon: 'branch',
    props: [{ name: 'title', label: 'Title', control: 'text', wide: true, placeholder: 'Expected execution' }, ID],
    hasChildren: true,
  },
  // Document blocks (ADR 0039, client/mdx/docBlocks.tsx).
  {
    tag: 'FileTree',
    label: 'File tree',
    icon: 'file',
    props: [{ name: 'title', label: 'Title', control: 'text', wide: true, placeholder: 'Files touched' }],
    hasChildren: true,
  },
  {
    tag: 'File',
    label: 'File',
    props: [
      { name: 'path', label: 'Path', control: 'text', wide: true, placeholder: 'src/path/file.ts' },
      { name: 'change', label: 'Change', control: 'select', options: CHANGES },
      { name: 'from', label: 'From', control: 'text', placeholder: 'old/path', when: { name: 'change', is: 'renamed' } },
    ],
    hasChildren: true,
    row: true,
  },
  {
    tag: 'Endpoint',
    label: 'API endpoint',
    icon: 'globe',
    props: [
      { name: 'path', label: 'Path', control: 'text', wide: true, placeholder: '/api/resource/{id}' },
      { name: 'method', label: 'Method', control: 'select', options: METHODS },
      { name: 'change', label: 'Change', control: 'select', options: CHANGES, optional: true },
      { name: 'auth', label: 'Auth', control: 'text', placeholder: 'API key' },
      { name: 'open', label: 'Open', control: 'flag' },
    ],
    hasChildren: true,
  },
  {
    tag: 'Param',
    label: 'Param',
    props: [
      { name: 'name', label: 'Name', control: 'text', wide: true, placeholder: 'name' },
      { name: 'in', label: 'In', control: 'select', options: PARAM_PLACES },
      { name: 'type', label: 'Type', control: 'text', placeholder: 'string' },
      { name: 'required', label: 'Required', control: 'flag' },
    ],
    hasChildren: true,
    row: true,
  },
  { tag: 'Request', label: 'Request', props: [], hasChildren: true, row: true },
  {
    tag: 'Response',
    label: 'Response',
    props: [{ name: 'status', label: 'Status', control: 'text', wide: true, placeholder: '200' }],
    hasChildren: true,
    row: true,
  },
  {
    tag: 'DataModel',
    label: 'Data model',
    icon: 'database',
    props: [{ name: 'title', label: 'Title', control: 'text', wide: true, placeholder: 'Tables' }],
    hasChildren: true,
  },
  {
    tag: 'Entity',
    label: 'Table',
    props: [
      { name: 'name', label: 'Name', control: 'text', wide: true, placeholder: 'table_name' },
      { name: 'change', label: 'Change', control: 'select', options: CHANGES, optional: true },
      { name: 'collapsed', label: 'Folded', control: 'flag' },
    ],
    hasChildren: true,
    row: true,
  },
  {
    tag: 'Attr',
    label: 'Field',
    props: [
      { name: 'name', label: 'Name', control: 'text', wide: true, placeholder: 'column' },
      { name: 'type', label: 'Type', control: 'text', placeholder: 'text' },
      { name: 'fk', label: 'FK', control: 'text', placeholder: 'table.id' },
      { name: 'change', label: 'Change', control: 'select', options: CHANGES, optional: true },
      { name: 'pk', label: 'PK', control: 'flag' },
      { name: 'nullable', label: 'Null', control: 'flag' },
    ],
    hasChildren: false,
    row: true,
  },
  {
    tag: 'Relation',
    label: 'Relation',
    props: [
      { name: 'from', label: 'From', control: 'text', wide: true, placeholder: 'table' },
      { name: 'to', label: 'To', control: 'text', placeholder: 'table' },
      { name: 'kind', label: 'Kind', control: 'select', options: RELATIONS },
    ],
    hasChildren: false,
    row: true,
  },
  {
    tag: 'JsonView',
    label: 'JSON',
    icon: 'package',
    props: [
      { name: 'title', label: 'Title', control: 'text', wide: true, placeholder: 'Response body' },
      { name: 'depth', label: 'Open levels', control: 'text', placeholder: '2' },
    ],
    hasChildren: true,
  },
  {
    tag: 'AnnotatedCode',
    label: 'Annotated code',
    icon: 'file',
    props: [
      { name: 'title', label: 'Title', control: 'text', wide: true, placeholder: 'src/path/file.ts' },
      { name: 'start', label: 'First line', control: 'text', placeholder: '1' },
    ],
    hasChildren: true,
  },
  {
    tag: 'Note',
    label: 'Note',
    props: [
      { name: 'label', label: 'Label', control: 'text', wide: true, placeholder: 'Short label' },
      { name: 'lines', label: 'Lines', control: 'text', placeholder: '12-14' },
    ],
    hasChildren: true,
    row: true,
  },
  {
    tag: 'Tabs',
    label: 'Tabs',
    icon: 'list',
    props: [{ name: 'label', label: 'Label', control: 'text', wide: true, placeholder: 'What the tabs show' }],
    hasChildren: true,
  },
  {
    tag: 'Tab',
    label: 'Tab',
    props: [{ name: 'label', label: 'Label', control: 'text', wide: true, placeholder: 'Tab name' }],
    hasChildren: true,
    row: true,
  },
  { tag: 'Compare', label: 'Compare', icon: 'branch', props: [], hasChildren: true },
  {
    tag: 'Pane',
    label: 'Pane',
    props: [{ name: 'label', label: 'Label', control: 'text', wide: true, placeholder: 'Before' }],
    hasChildren: true,
    row: true,
  },
  {
    tag: 'Update',
    label: 'Update',
    icon: 'flag',
    props: [
      { name: 'by', label: 'By', control: 'text', wide: true, placeholder: 'Agent' },
      { name: 'health', label: 'Health', control: 'select', options: HEALTHS, optional: true },
      { name: 'date', label: 'Date', control: 'text', placeholder: 'YYYY-MM-DD' },
    ],
    hasChildren: true,
  },
  { tag: 'Properties', label: 'Properties', icon: 'list', props: [], hasChildren: true },
  {
    tag: 'Prop',
    label: 'Property',
    props: [{ name: 'label', label: 'Label', control: 'text', wide: true, placeholder: 'Owner' }],
    hasChildren: true,
    row: true,
  },
]

function readAttr(node: JsxNode, name: string): string {
  for (const attribute of node.attributes) {
    if (attribute.type !== 'mdxJsxAttribute' || attribute.name !== name) continue
    if (typeof attribute.value === 'string') return attribute.value
    if (attribute.value === null || attribute.value === undefined) return 'true'
    return attribute.value.value
  }
  return ''
}

/** Change one attribute and keep the rest, in their order, as the file had them. */
function withAttr(node: JsxNode, name: string, value: string): JsxNode['attributes'] {
  const index = node.attributes.findIndex((attribute) => attribute.type === 'mdxJsxAttribute' && attribute.name === name)
  const next = [...node.attributes]
  if (value === '') {
    if (index >= 0) next.splice(index, 1)
    return next
  }
  const attribute: MdxJsxAttribute = { type: 'mdxJsxAttribute', name, value }
  if (index >= 0) next.splice(index, 1, attribute)
  else next.push(attribute)
  return next
}

/** Change several attributes at once; an empty value removes one. */
function withAttrs(node: JsxNode, changes: Record<string, string>): JsxNode['attributes'] {
  return Object.entries(changes).reduce(
    (attributes, [name, value]) => withAttr({ ...node, attributes } as JsxNode, name, value),
    node.attributes,
  )
}

function PropControl({
  spec,
  value,
  onChange,
  disabled = false,
}: {
  spec: PropSpec
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const id = useId()
  if (spec.control === 'flag') {
    return (
      <label className="plan-editor-flag">
        <input
          type="checkbox"
          checked={value === 'true'}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked ? 'true' : 'false')}
        />
        {spec.label}
      </label>
    )
  }
  if (spec.control === 'select') {
    const options = spec.optional ? [NONE, ...(spec.options ?? [])] : (spec.options ?? [])
    const current = value || (spec.optional ? NONE : (options[0] ?? ''))
    return (
      <Select
        value={current}
        disabled={disabled}
        onValueChange={(next) => onChange(next === NONE ? '' : String(next ?? ''))}
      >
        <SelectTrigger className="plan-editor-select" aria-label={spec.label}>
          <SelectValue>{(selected: unknown) => (selected === NONE ? 'none' : String(selected ?? ''))}</SelectValue>
        </SelectTrigger>
        <SelectContent className="plan-editor-select-popup">
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option === NONE ? 'none' : option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }
  return (
    <input
      id={id}
      className={cx('plan-editor-input', spec.wide && 'plan-editor-input-wide')}
      aria-label={spec.label}
      placeholder={spec.placeholder}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

/**
 * Write a card's fields into the plan. Unlike the editor's own updater, this one leaves the caret
 * and the scroll position alone: the person is typing in a field, not in the text.
 */
function useCardUpdater(): (patch: Partial<JsxNode>) => void {
  const { parentEditor, lexicalNode, mdastNode } = useNestedEditorContext<JsxNode>()
  return (patch) => {
    parentEditor.update(
      () => {
        const current = $getNodeByKey(lexicalNode.getKey()) as { setMdastNode?: (node: JsxNode) => void } | null
        current?.setMdastNode?.({ ...mdastNode, ...patch } as JsxNode)
      },
      { discrete: true, tag: [HISTORY_PUSH_TAG, SKIP_DOM_SELECTION_TAG, SKIP_SCROLL_INTO_VIEW_TAG] },
    )
    // A card inside another card's body passes the change up to that card.
    parentEditor.dispatchCommand(NESTED_EDITOR_UPDATED_COMMAND, undefined)
  }
}

function EntryEditor({ spec, mdastNode }: { spec: EntrySpec; mdastNode: JsxNode }) {
  const update = useCardUpdater()
  const remove = useLexicalNodeRemove()
  // A checklist item without a status shows as done or pending, from `done`.
  const itemDone = spec.tag === 'item' && readAttr(mdastNode, 'done') === 'true' ? 'done' : undefined
  const status = phaseStatus(readAttr(mdastNode, 'status') || itemDone)
  const kind = spec.tag === 'callout' ? calloutKind(readAttr(mdastNode, 'kind') || undefined) : undefined
  const set = (name: string, value: string) => update({ attributes: withAttr(mdastNode, name, value) })
  const label = kind ? `${spec.label} · ${kind}` : spec.label
  const head = useRef<HTMLDivElement>(null)
  useIsolatedFromEditor(head)
  // A card in LOCKED_ENTRY_TAGS, and every row inside one, shows as it is and cannot be changed.
  const insideLocked = useContext(LockedContext)
  // The answer cards (form, questions) unless `locked="false"`, and any card with `locked` (ADR 0039).
  const lockedHere = isLockedMdast(mdastNode)
  const lockedByPlan = lockedHere && lockedAttribute(mdastNode) === true && !isLockedTag(spec.tag)
  const locked = insideLocked || lockedHere
  // Removing this card would remove a locked card inside it.
  const holdsLocked = useMemo(() => containsLocked(mdastNode), [mdastNode])
  // A locked card the page can draw shows as the page draws it: no editing controls, all disabled.
  const preview = useMemo(
    () => (lockedHere && !lockedByPlan && hasLockedPreview(spec.tag) ? renderLockedPreview(mdastNode) : null),
    [lockedHere, mdastNode, spec.tag],
  )
  if (preview) {
    return (
      <section className="plan-editor-locked-card" data-editor-entry={spec.tag} data-locked="true" aria-disabled="true" ref={head}>
        <div className="plan-editor-locked-note">
          <Lock size={12} strokeWidth={2.25} aria-hidden="true" />
          <span>Answered on the page · it can be moved, not changed</span>
        </div>
        {preview}
      </section>
    )
  }
  const control = (prop: PropSpec) => (
    <PropControl spec={prop} value={readAttr(mdastNode, prop.name)} disabled={locked} onChange={(value) => set(prop.name, value)} />
  )
  return (
    <section
      className={cx('plan-editor-card', spec.row ? 'plan-editor-row' : 'plan-entry', spec.tag === 'callout' && 'plan-callout')}
      data-editor-entry={spec.tag}
      data-kind={kind}
      data-status={spec.pickStatus ? status : undefined}
      data-locked={locked ? 'true' : undefined}
      aria-disabled={locked || undefined}
    >
      {lockedByPlan ? (
        <div className="plan-editor-locked-note">
          <Lock size={12} strokeWidth={2.25} aria-hidden="true" />
          <span>Locked by the plan · it can be moved, not changed</span>
        </div>
      ) : null}
      <div className="plan-editor-head" ref={head}>
        {spec.pickStatus ? (
          <StatusPicker
            status={status}
            disabled={locked}
            onChange={(next) =>
              // An item says done with `done="true"`, as agents write it, and uses `status` only for the
              // states `done` cannot say. One attribute carries the state, so the file says one thing.
              spec.tag === 'item'
                ? update({
                    attributes: withAttrs(mdastNode, {
                      done: next === 'done' ? 'true' : readAttr(mdastNode, 'done') ? 'false' : '',
                      status: next === 'done' || next === 'pending' ? '' : next,
                    }),
                  })
                : set('status', next)
            }
          />
        ) : null}
        {spec.pickIcon && locked ? (
          <CardLabel icon={readAttr(mdastNode, 'icon') || undefined} color={readAttr(mdastNode, 'color')} className="plan-editor-kicker">
            {label}
          </CardLabel>
        ) : spec.pickIcon ? (
          <IconPicker
            icon={readAttr(mdastNode, 'icon')}
            color={readAttr(mdastNode, 'color')}
            label={label}
            defaultTint={kind ? KIND_TINT[kind] : undefined}
            onChange={(next) => update({ attributes: withAttrs(mdastNode, next) })}
          />
        ) : (
          <CardLabel icon={spec.icon} className="plan-editor-kicker">
            {label}
          </CardLabel>
        )}
        {spec.props
          .filter((prop) => prop.wide)
          .map((prop) => (
            <Fragment key={prop.name}>{control(prop)}</Fragment>
          ))}
        {lockedHere ? (
          <span
            className="plan-editor-locked"
            title={
              lockedByPlan
                ? 'Locked by the plan. It can be moved, not changed.'
                : 'The agent writes this card for people to answer on the page. Move it with its grip.'
            }
          >
            <Lock size={12} strokeWidth={2.25} aria-hidden="true" />
            Locked
          </span>
        ) : null}
        <button
          type="button"
          className="plan-editor-remove"
          aria-label={`Remove ${spec.label.toLowerCase()}`}
          title={locked ? 'Locked cards cannot be removed' : holdsLocked ? 'It holds a locked card, so it cannot be removed' : 'Remove'}
          disabled={locked || holdsLocked}
          onClick={remove}
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
        <div className="plan-editor-props">
          {spec.props
            .filter((prop) => !prop.wide)
            .filter((prop) => !prop.when || readAttr(mdastNode, prop.when.name) === prop.when.is || readAttr(mdastNode, prop.name) !== '')
            .map((prop) =>
              prop.control === 'flag' ? (
                <Fragment key={prop.name}>{control(prop)}</Fragment>
              ) : (
                <span key={prop.name} className="plan-editor-prop">
                  <span className="plan-editor-prop-name" aria-hidden="true">
                    {prop.label}
                  </span>
                  {control(prop)}
                </span>
              ),
            )}
        </div>
      </div>
      {spec.hasChildren ? (
        <div className="plan-editor-body plan-rich">
          <LockedContext.Provider value={locked}>
            {/* A row written on one line (`<item done="true">Text</item>`) holds text, not blocks. */}
            <NestedLexicalEditor<JsxNode>
              block={mdastNode.type !== 'mdxJsxTextElement'}
              getContent={(node) => node.children}
              getUpdatedMdastNode={(node, children) => ({ ...node, children } as JsxNode)}
            />
          </LockedContext.Provider>
        </div>
      ) : null}
    </section>
  )
}

function editorFor(spec: EntrySpec) {
  function SpecEditor({ mdastNode }: JsxEditorProps) {
    return <EntryEditor spec={spec} mdastNode={mdastNode} />
  }
  SpecEditor.displayName = `${spec.label}Editor`
  return SpecEditor
}

/**
 * The generic editor for layout and charts, with `locked` honored (ADR 0039): a locked
 * block's body is read-only, as a plan card's is.
 */
function LockableGenericEditor(props: JsxEditorProps) {
  const locked = isLockedMdast(props.mdastNode)
  return (
    <LockedContext.Provider value={locked}>
      <div className="plan-editor-generic" data-locked={locked ? 'true' : undefined}>
        {locked ? (
          <div className="plan-editor-locked-note">
            <Lock size={12} strokeWidth={2.25} aria-hidden="true" />
            <span>Locked by the plan · it can be moved, not changed</span>
          </div>
        ) : null}
        <GenericJsxEditor {...props} />
      </div>
    </LockedContext.Provider>
  )
}

/** One editor per plan tag, a table editor for `<DataTable>`, and the generic editor for anything else (layout, charts). */
export const planJsxDescriptors: JsxComponentDescriptor[] = [
  ...ENTRY_SPECS.map((spec) => ({
    name: spec.tag,
    kind: 'flow' as const,
    props: [
      ...spec.props.map((prop) => prop.name),
      ...(spec.pickIcon ? ['icon', 'color'] : []),
      ...(spec.pickStatus ? ['status'] : []),
    ].map((name) => ({
      name,
      type: 'string' as const,
    })),
    hasChildren: spec.hasChildren,
    Editor: editorFor(spec),
  })),
  // An inline file reference inside prose (ADR 0039).
  {
    name: 'Path',
    kind: 'text',
    props: ['path', 'change', 'lines'].map((name) => ({ name, type: 'string' as const })),
    hasChildren: true,
    Editor: GenericJsxEditor,
  },
  // Columns, rows, and cells are edited inside it as a grid, never as tags of their own.
  dataTableDescriptor,
  // Pills and chips, in a cell or in prose, look as they do on the page.
  ...labelDescriptors,
  { name: '*', kind: 'flow', props: [], hasChildren: true, Editor: LockableGenericEditor },
]
