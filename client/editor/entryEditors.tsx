import {
  GenericJsxEditor,
  NestedLexicalEditor,
  useLexicalNodeRemove,
  useMdastNodeUpdater,
  type JsxComponentDescriptor,
  type JsxEditorProps,
} from '@mdxeditor/editor'
import { Trash2 } from 'lucide-react'
import type { MdxJsxAttribute, MdxJsxFlowElement, MdxJsxTextElement } from 'mdast-util-mdx-jsx'
import { useId, useRef } from 'react'
import { StatusIcon } from '../execution-canvas/adapters/reactFlow/StatusIcon.tsx'
import { CardLabel, cardIconNames } from '../entries/CardLabel.tsx'
import { cx } from '../entries/styles.ts'
import { calloutKind, phaseStatus } from '../entries/types.ts'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.tsx'
import { useIsolatedFromEditor } from './isolate.ts'

type JsxNode = MdxJsxFlowElement | MdxJsxTextElement

const PHASE_STATUSES = ['pending', 'active', 'blocked', 'done', 'failed']
const CALLOUT_KINDS = ['note', 'tip', 'risk', 'decision', 'warning']
const FIELD_TYPES = ['text', 'number', 'textarea', 'select', 'checkbox', 'stepper']
const NO_ICON = '__none__'

type PropSpec = {
  name: string
  label: string
  control: 'text' | 'select' | 'icon' | 'flag'
  options?: string[]
  /** Takes the free width of the header row. */
  wide?: boolean
  placeholder?: string
}

type EntrySpec = {
  /** The tag name the editor sees. */
  tag: string
  label: string
  /** Icon shown when the card has none of its own. */
  icon?: string
  props: PropSpec[]
  hasChildren: boolean
  /** A row inside a card (option, field, item) rather than a card of its own. */
  row?: boolean
}

const ID: PropSpec = { name: 'id', label: 'Id', control: 'text', placeholder: 'id' }
const ICON: PropSpec = { name: 'icon', label: 'Icon', control: 'icon' }

export const ENTRY_SPECS: EntrySpec[] = [
  {
    tag: 'phase',
    label: 'Phase',
    props: [
      { name: 'title', label: 'Title', control: 'text', wide: true, placeholder: 'Phase title' },
      { name: 'status', label: 'Status', control: 'select', options: PHASE_STATUSES },
      ID,
    ],
    hasChildren: true,
  },
  {
    tag: 'callout',
    label: 'Callout',
    icon: 'info',
    props: [
      { name: 'title', label: 'Title', control: 'text', wide: true, placeholder: 'Callout title' },
      { name: 'kind', label: 'Kind', control: 'select', options: CALLOUT_KINDS },
      ICON,
      ID,
    ],
    hasChildren: true,
  },
  {
    tag: 'choice',
    label: 'Choice',
    icon: 'decision',
    props: [{ name: 'prompt', label: 'Prompt', control: 'text', wide: true, placeholder: 'What should the person pick?' }, ICON, ID],
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
    icon: 'file',
    props: [{ name: 'prompt', label: 'Prompt', control: 'text', wide: true, placeholder: 'What should the person fill in?' }, ICON, ID],
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
    icon: 'help',
    props: [{ name: 'prompt', label: 'Prompt', control: 'text', wide: true, placeholder: 'What should the person answer?' }, ICON, ID],
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
    icon: 'check',
    props: [{ name: 'prompt', label: 'Prompt', control: 'text', wide: true, placeholder: 'What should the person approve?' }, ICON, ID],
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

function PropControl({ spec, value, onChange }: { spec: PropSpec; value: string; onChange: (value: string) => void }) {
  const id = useId()
  if (spec.control === 'flag') {
    return (
      <label className="plan-editor-flag">
        <input type="checkbox" checked={value === 'true'} onChange={(event) => onChange(event.target.checked ? 'true' : 'false')} />
        {spec.label}
      </label>
    )
  }
  if (spec.control === 'select' || spec.control === 'icon') {
    const options = spec.control === 'icon' ? [NO_ICON, ...cardIconNames] : (spec.options ?? [])
    const current = spec.control === 'icon' ? value || NO_ICON : value || (spec.options?.[0] ?? '')
    return (
      <Select value={current} onValueChange={(next) => onChange(next === NO_ICON ? '' : String(next ?? ''))}>
        <SelectTrigger className="plan-editor-select" aria-label={spec.label}>
          <SelectValue>
            {(selected: string) =>
              spec.control === 'icon' ? (
                selected && selected !== NO_ICON ? (
                  <CardLabel icon={selected}>{selected}</CardLabel>
                ) : (
                  'No icon'
                )
              ) : (
                selected
              )
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {spec.control === 'icon' ? option === NO_ICON ? 'No icon' : <CardLabel icon={option}>{option}</CardLabel> : option}
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
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

function EntryEditor({ spec, mdastNode }: { spec: EntrySpec; mdastNode: JsxNode }) {
  const update = useMdastNodeUpdater()
  const remove = useLexicalNodeRemove()
  const icon = readAttr(mdastNode, 'icon') || spec.icon
  const status = phaseStatus(readAttr(mdastNode, 'status') || undefined)
  const kind = spec.tag === 'callout' ? calloutKind(readAttr(mdastNode, 'kind') || undefined) : undefined
  const set = (name: string, value: string) => update({ attributes: withAttr(mdastNode, name, value) })
  const head = useRef<HTMLDivElement>(null)
  useIsolatedFromEditor(head)
  return (
    <section
      className={cx('plan-editor-card', spec.row ? 'plan-editor-row' : 'plan-entry', spec.tag === 'callout' && 'plan-callout')}
      data-editor-entry={spec.tag}
      data-kind={kind}
      data-status={spec.tag === 'phase' ? status : undefined}
    >
      <div className="plan-editor-head" ref={head}>
        {spec.tag === 'phase' ? (
          <span className="plan-phase-status plan-editor-status" aria-hidden="true">
            <StatusIcon status={status} />
          </span>
        ) : null}
        <CardLabel icon={icon} className="plan-editor-kicker">
          {kind ? `${spec.label} · ${kind}` : spec.label}
        </CardLabel>
        {spec.props
          .filter((prop) => prop.wide)
          .map((prop) => (
            <PropControl key={prop.name} spec={prop} value={readAttr(mdastNode, prop.name)} onChange={(value) => set(prop.name, value)} />
          ))}
        <button type="button" className="plan-editor-remove" aria-label={`Remove ${spec.label.toLowerCase()}`} title="Remove" onClick={remove}>
          <Trash2 size={14} aria-hidden="true" />
        </button>
        <div className="plan-editor-props">
          {spec.props
            .filter((prop) => !prop.wide)
            .map((prop) =>
              prop.control === 'flag' ? (
                <PropControl key={prop.name} spec={prop} value={readAttr(mdastNode, prop.name)} onChange={(value) => set(prop.name, value)} />
              ) : (
                <span key={prop.name} className="plan-editor-prop">
                  <span className="plan-editor-prop-name" aria-hidden="true">
                    {prop.label}
                  </span>
                  <PropControl spec={prop} value={readAttr(mdastNode, prop.name)} onChange={(value) => set(prop.name, value)} />
                </span>
              ),
            )}
        </div>
      </div>
      {spec.hasChildren ? (
        <div className="plan-editor-body plan-rich">
          <NestedLexicalEditor<JsxNode>
            block
            getContent={(node) => node.children}
            getUpdatedMdastNode={(node, children) => ({ ...node, children } as JsxNode)}
          />
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
    props: spec.props.map((prop) => ({ name: prop.name, type: 'string' as const })),
    hasChildren: spec.hasChildren,
    Editor: editorFor(spec),
  })),
  { name: '*', kind: 'flow', props: [], hasChildren: true, Editor: GenericJsxEditor },
]
