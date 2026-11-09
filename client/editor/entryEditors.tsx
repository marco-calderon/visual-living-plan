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
import { Fragment, useContext, useId, useRef } from 'react'
import { CardLabel } from '../entries/CardLabel.tsx'
import { cx } from '../entries/styles.ts'
import { calloutKind, phaseStatus } from '../entries/types.ts'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.tsx'
import { IconPicker } from './iconPicker.tsx'
import { isLockedTag, LockedContext } from './locked.ts'
import { StatusPicker } from './statusPicker.tsx'
import { useIsolatedFromEditor } from './isolate.ts'

type JsxNode = MdxJsxFlowElement | MdxJsxTextElement

const CALLOUT_KINDS = ['note', 'tip', 'risk', 'decision', 'warning']
const FIELD_TYPES = ['text', 'number', 'textarea', 'select', 'checkbox', 'stepper']

type PropSpec = {
  name: string
  label: string
  control: 'text' | 'select' | 'flag'
  options?: string[]
  /** Takes the free width of the header row. */
  wide?: boolean
  placeholder?: string
}

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
    props: [{ name: 'label', label: 'Label', control: 'text', wide: true, placeholder: 'Option label' }, ID],
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
    props: [{ name: 'done', label: 'Done', control: 'flag' }],
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
    const options = spec.options ?? []
    return (
      <Select value={value || (options[0] ?? '')} disabled={disabled} onValueChange={(next) => onChange(String(next ?? ''))}>
        <SelectTrigger className="plan-editor-select" aria-label={spec.label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="plan-editor-select-popup">
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
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
  const status = phaseStatus(readAttr(mdastNode, 'status') || undefined)
  const kind = spec.tag === 'callout' ? calloutKind(readAttr(mdastNode, 'kind') || undefined) : undefined
  const set = (name: string, value: string) => update({ attributes: withAttr(mdastNode, name, value) })
  const label = kind ? `${spec.label} · ${kind}` : spec.label
  const head = useRef<HTMLDivElement>(null)
  useIsolatedFromEditor(head)
  // A card in LOCKED_ENTRY_TAGS, and every row inside one, shows as it is and cannot be changed.
  const insideLocked = useContext(LockedContext)
  const lockedHere = isLockedTag(spec.tag)
  const locked = insideLocked || lockedHere
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
      <div className="plan-editor-head" ref={head}>
        {spec.pickStatus ? <StatusPicker status={status} disabled={locked} onChange={(next) => set('status', next)} /> : null}
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
          <span className="plan-editor-locked" title="The agent writes this card for people to answer on the page. Move it with its grip.">
            <Lock size={12} strokeWidth={2.25} aria-hidden="true" />
            Locked
          </span>
        ) : null}
        <button
          type="button"
          className="plan-editor-remove"
          aria-label={`Remove ${spec.label.toLowerCase()}`}
          title={locked ? 'Locked cards cannot be removed' : 'Remove'}
          disabled={locked}
          onClick={remove}
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
        <div className="plan-editor-props">
          {spec.props
            .filter((prop) => !prop.wide)
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
            <NestedLexicalEditor<JsxNode>
              block
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

/** One editor per plan tag, and the generic editor for anything else (layout, charts, tables). */
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
  { name: '*', kind: 'flow', props: [], hasChildren: true, Editor: GenericJsxEditor },
]
