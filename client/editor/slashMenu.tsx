import {
  $createCodeBlockNode,
  $createImageNode,
  activeEditor$,
  addComposerChild$,
  addNestedEditorChild$,
  insertJsx$,
  insertTable$,
  NESTED_EDITOR_UPDATED_COMMAND,
  NestedEditorsContext,
  realmPlugin,
  usePublisher,
} from '@mdxeditor/editor'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $createLinkNode } from '@lexical/link'
import { $createHeadingNode, $createQuoteNode, type HeadingTagType } from '@lexical/rich-text'
import { $setBlocksType } from '@lexical/selection'
import {
  $createParagraphNode,
  $createRangeSelection,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $isElementNode,
  $setSelection,
  $getSelection,
  $isDecoratorNode,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_NORMAL,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
  type ElementNode,
  type LexicalEditor,
} from 'lexical'
import { LexicalTypeaheadMenuPlugin, MenuOption, useBasicTypeaheadTriggerMatch } from '@lexical/react/LexicalTypeaheadMenuPlugin'
import type { MdxJsxAttribute, MdxJsxFlowElement } from 'mdast-util-mdx-jsx'
import type { Paragraph } from 'mdast'
import {
  Code,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  Image as ImageIcon,
  Link as LinkIcon,
  Quote,
  Type,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import { Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CardLabel, type CardIcon } from '../entries/CardLabel.tsx'
import { focusFenceWhenReady } from './codeFence.tsx'
import { InsertPrompt, type InsertKind, type InsertValues } from './insertPrompt.tsx'

/** The menu's sections, in the order it shows them. */
const SECTIONS = ['Text', 'Links and media', 'Code', 'Cards', 'Data', 'Layout', 'In this card'] as const
type Section = (typeof SECTIONS)[number]

type Card = {
  key: string
  section: Section
  label: string
  hint: string
  icon: CardIcon
  /** Words that also find this card. */
  keywords: string[]
  /** Rows only make sense inside a card. */
  nested?: boolean
  /** A row the menu offers only inside these cards (their name in the editor). Without it, any card. */
  parents?: string[]
  /**
   * Cards the agent writes for the person to answer (decisions, choices, forms, questions,
   * approvals). The editor still edits them where the plan has them, but the menu does not offer them.
   */
  agentOnly?: boolean
  /** The card to add. Without one (and without a fence) the line stays a paragraph. */
  build?: () => MdxJsxFlowElement
  /** A fenced code block to add instead of a card. */
  fence?: { language: string; code: string }
  /** The block the "/" line becomes, keeping its text: a heading, a quote, or a plain paragraph. */
  block?: () => ElementNode
  /** Asks for an address first, then adds a link or an image where the "/" was. */
  prompt?: InsertKind
  /** Adds a markdown table of this size where the "/" was. */
  table?: { rows: number; columns: number }
}

function shortId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 6)}`
}

function text(value: string): Paragraph {
  return { type: 'paragraph', children: [{ type: 'text', value }] }
}

function attrs(values: Record<string, string>): MdxJsxAttribute[] {
  return Object.entries(values).map(([name, value]) => ({ type: 'mdxJsxAttribute', name, value }))
}

function element(name: string, values: Record<string, string>, children: MdxJsxFlowElement['children'] = []): MdxJsxFlowElement {
  return { type: 'mdxJsxFlowElement', name, attributes: attrs(values), children }
}

/** A fenced code block inside a card. */
function fenceNode(lang: string, value: string): MdxJsxFlowElement['children'][number] {
  return { type: 'code', lang, value }
}

/** A document block's row (ADR 0039), offered only inside its parent block. */
function row(key: string, parent: string, label: string, hint: string, icon: string, build: () => MdxJsxFlowElement): Card {
  return { key, section: 'In this card', label, hint, icon, keywords: [key, label.toLowerCase()], nested: true, parents: [parent], build }
}

function glyph(Icon: LucideIcon) {
  return <Icon size={16} strokeWidth={2} />
}

const HEADING_ICONS: LucideIcon[] = [Heading1, Heading2, Heading3, Heading4, Heading5, Heading6]

function heading(level: number): Card {
  const tag = `h${level}` as HeadingTagType
  return {
    key: tag,
    section: 'Text',
    label: `Heading ${level}`,
    hint: level === 1 ? 'The largest title' : level === 6 ? 'The smallest title' : `A level ${level} title`,
    icon: glyph(HEADING_ICONS[level - 1]!),
    keywords: [tag, 'heading', `heading${level}`, 'title', '#'.repeat(level)],
    block: () => $createHeadingNode(tag),
  }
}

function callout(kind: string, icon: string, label: string, agentOnly = false): Card {
  return {
    key: `callout-${kind}`,
    section: 'Cards',
    agentOnly,
    label,
    hint: `A ${kind} callout`,
    icon,
    keywords: ['callout', kind],
    build: () => element('callout', { id: shortId(kind), kind, title: `New ${label.toLowerCase()}`, icon }, [text('Write the note here.')]),
  }
}

/** Everything the slash menu knows, in the order it lists them. */
export const SLASH_CARDS: Card[] = [
  {
    key: 'text',
    section: 'Text',
    label: 'Text',
    hint: 'A paragraph to write in',
    icon: glyph(Type),
    keywords: ['text', 'paragraph', 'plain'],
    block: () => $createParagraphNode(),
  },
  ...[1, 2, 3, 4, 5, 6].map(heading),
  {
    key: 'quote',
    section: 'Text',
    label: 'Quote',
    hint: 'Quoted text, shown set apart',
    icon: glyph(Quote),
    keywords: ['quote', 'blockquote', 'citation', '>'],
    block: () => $createQuoteNode(),
  },
  {
    key: 'link',
    section: 'Links and media',
    label: 'Link',
    hint: 'A link to a web address',
    icon: glyph(LinkIcon),
    keywords: ['link', 'url', 'href', 'web'],
    prompt: 'link',
  },
  {
    key: 'image',
    section: 'Links and media',
    label: 'Image',
    hint: 'An image from a web address',
    icon: glyph(ImageIcon),
    keywords: ['image', 'picture', 'photo', 'img', 'screenshot'],
    prompt: 'image',
  },
  {
    key: 'code',
    section: 'Code',
    label: 'Code',
    hint: 'A code block with syntax highlighting',
    icon: glyph(Code),
    keywords: ['code', 'snippet', 'fence', 'block'],
    fence: { language: 'ts', code: '' },
  },
  {
    key: 'mermaid',
    section: 'Code',
    label: 'Mermaid',
    hint: 'A diagram drawn from mermaid code',
    icon: glyph(Workflow),
    keywords: ['mermaid', 'diagram', 'chart', 'flowchart'],
    fence: { language: 'mermaid', code: 'flowchart LR\n  A[Start] --> B[Finish]' },
  },
  {
    key: 'phase',
    section: 'Cards',
    label: 'Phase',
    hint: 'A step of the work, with a status',
    icon: 'flag',
    keywords: ['phase', 'step', 'status'],
    build: () => element('phase', { id: shortId('phase'), title: 'New phase', status: 'pending' }, [text('Describe the work in this phase.')]),
  },
  callout('note', 'info', 'Note'),
  callout('tip', 'idea', 'Tip'),
  callout('risk', 'alert', 'Risk'),
  callout('decision', 'decision', 'Decision', true),
  callout('warning', 'shield', 'Warning'),
  {
    key: 'choice',
    section: 'Cards',
    agentOnly: true,
    label: 'Choice',
    hint: 'The person picks one option',
    icon: 'decision',
    keywords: ['choice', 'pick', 'option', 'radio'],
    build: () =>
      element('choice', { id: shortId('choice'), prompt: 'Which option should we take?' }, [
        element('plan-option', { id: 'a', label: 'Option A' }, [text('What option A means.')]),
        element('plan-option', { id: 'b', label: 'Option B' }, [text('What option B means.')]),
      ]),
  },
  {
    key: 'form',
    section: 'Cards',
    agentOnly: true,
    label: 'Form',
    hint: 'Fields the person fills in',
    icon: 'file',
    keywords: ['form', 'field', 'input'],
    build: () =>
      element('plan-form', { id: shortId('form'), prompt: 'Fill in the details' }, [
        element('field', { name: 'value', label: 'Value', type: 'text' }),
      ]),
  },
  {
    key: 'questions',
    section: 'Cards',
    agentOnly: true,
    label: 'Questions',
    hint: 'Free-text answers, one per item',
    icon: 'help',
    keywords: ['questions', 'ask', 'answer'],
    build: () =>
      element('questions', { id: shortId('questions'), prompt: 'Anything the agent should know?' }, [
        element('item', {}, [text('First question?')]),
      ]),
  },
  {
    key: 'approve',
    section: 'Cards',
    agentOnly: true,
    label: 'Approval',
    hint: 'A yes or no gate',
    icon: 'check',
    keywords: ['approve', 'approval', 'gate', 'yes', 'no'],
    build: () => element('approve', { id: shortId('approve'), prompt: 'Proceed?' }, [text('What happens after approval.')]),
  },
  {
    key: 'checklist',
    section: 'Cards',
    label: 'Checklist',
    hint: 'Lines the agent ticks off',
    icon: 'list',
    keywords: ['checklist', 'todo', 'done'],
    build: () => element('checklist', { id: shortId('checklist'), title: 'Done when' }, [element('item', { done: 'false' }, [text('First check')])]),
  },
  {
    key: 'update',
    section: 'Cards',
    label: 'Update',
    hint: 'A dated status note with a health level',
    icon: 'flag',
    keywords: ['update', 'status', 'health', 'progress', 'report'],
    build: () =>
      element('Update', { health: 'on-track', by: 'Agent', date: new Date().toISOString().slice(0, 10) }, [text('What changed since the last update.')]),
  },
  {
    key: 'annotated-code',
    section: 'Code',
    label: 'Annotated code',
    hint: 'Code with numbered notes on its lines',
    icon: 'file',
    keywords: ['annotated', 'code', 'notes', 'walkthrough', 'explain'],
    build: () =>
      element('AnnotatedCode', { title: 'src/file.ts' }, [
        fenceNode('ts', 'export function example() {\n  return true\n}'),
        element('Note', { lines: '2', label: 'Why' }, [text('What this line does.')]),
      ]),
  },
  {
    key: 'json',
    section: 'Code',
    label: 'JSON',
    hint: 'A payload you can fold',
    icon: 'package',
    keywords: ['json', 'payload', 'response', 'body', 'object'],
    build: () => element('JsonView', { title: 'Response' }, [fenceNode('json', '{\n  "ok": true\n}')]),
  },
  {
    key: 'file-tree',
    section: 'Data',
    label: 'File tree',
    hint: 'Files a change adds, edits, or removes',
    icon: 'file',
    keywords: ['file', 'tree', 'files', 'paths', 'changes', 'touched'],
    build: () =>
      element('FileTree', { title: 'Files touched' }, [
        element('File', { path: 'src/new-file.ts', change: 'added' }, [text('What this file does.')]),
        element('File', { path: 'src/existing.ts', change: 'modified' }, [text('What changes here.')]),
      ]),
  },
  {
    key: 'endpoint',
    section: 'Data',
    label: 'API endpoint',
    hint: 'Method, path, params, and responses',
    icon: 'globe',
    keywords: ['api', 'endpoint', 'route', 'http', 'rest', 'request'],
    build: () =>
      element('Endpoint', { method: 'GET', path: '/api/resource/{id}', change: 'added' }, [
        text('What the endpoint does.'),
        element('Param', { name: 'id', in: 'path', type: 'string', required: 'true' }, [text('Which resource.')]),
        element('Response', { status: '200' }, [text('The resource.')]),
        element('Response', { status: '404' }, [text('No resource with this id.')]),
      ]),
  },
  {
    key: 'data-model',
    section: 'Data',
    label: 'Data model',
    hint: 'Tables, fields, keys, and relations',
    icon: 'database',
    keywords: ['data', 'model', 'schema', 'table', 'database', 'entity'],
    build: () =>
      element('DataModel', { title: 'Tables' }, [
        element('Entity', { name: 'items', change: 'added' }, [
          element('Attr', { name: 'id', type: 'text', pk: 'true' }),
          element('Attr', { name: 'created_at', type: 'timestamptz' }),
        ]),
      ]),
  },
  {
    key: 'table',
    section: 'Data',
    label: 'Table',
    hint: 'Rows and columns',
    icon: 'list',
    keywords: ['table', 'grid', 'rows', 'columns', 'matrix'],
    table: { rows: 3, columns: 3 },
  },
  {
    key: 'bar-chart',
    section: 'Data',
    label: 'Bar chart',
    hint: 'One bar per label and value',
    icon: 'zap',
    keywords: ['chart', 'bar', 'graph', 'numbers'],
    build: () => element('BarChart', { ariaLabel: 'New chart' }, [text('First, 3\nSecond, 5\nThird, 2')]),
  },
  {
    key: 'line-chart',
    section: 'Data',
    label: 'Line chart',
    hint: 'A value over time',
    icon: 'zap',
    keywords: ['chart', 'line', 'trend', 'graph', 'time'],
    build: () => element('LineChart', { ariaLabel: 'New chart' }, [text('Mon, 3\nTue, 5\nWed, 4')]),
  },
  {
    key: 'tabs',
    section: 'Layout',
    label: 'Tabs',
    hint: 'One view at a time',
    icon: 'list',
    keywords: ['tabs', 'tab', 'views'],
    build: () =>
      element('Tabs', {}, [
        element('Tab', { label: 'First' }, [text('What the first tab shows.')]),
        element('Tab', { label: 'Second' }, [text('What the second tab shows.')]),
      ]),
  },
  {
    key: 'compare',
    section: 'Layout',
    label: 'Compare',
    hint: 'Before and after, side by side',
    icon: 'branch',
    keywords: ['compare', 'before', 'after', 'side', 'columns'],
    build: () =>
      element('Compare', {}, [
        element('Pane', { label: 'Before' }, [text('How it works today.')]),
        element('Pane', { label: 'After' }, [text('How it works after the change.')]),
      ]),
  },
  {
    key: 'properties',
    section: 'Layout',
    label: 'Properties',
    hint: 'Labels and values: owner, flag, dates',
    icon: 'list',
    keywords: ['properties', 'props', 'facts', 'meta', 'owner'],
    build: () =>
      element('Properties', {}, [
        element('Prop', { label: 'Owner' }, [text('Team or person')]),
        element('Prop', { label: 'Target' }, [text('Date')]),
      ]),
  },
  row('file', 'FileTree', 'File', 'One more file', 'file', () => element('File', { path: 'src/file.ts', change: 'modified' }, [text('What changes here.')])),
  row('param', 'Endpoint', 'Param', 'One more parameter', 'key', () => element('Param', { name: 'name', in: 'query', type: 'string' }, [text('What it sets.')])),
  row('request', 'Endpoint', 'Request', 'An example request body', 'message', () => element('Request', {}, [fenceNode('json', '{\n  "name": "value"\n}')])),
  row('response', 'Endpoint', 'Response', 'One more response', 'message', () => element('Response', { status: '400' }, [text('When it happens.')])),
  row('entity', 'DataModel', 'Table', 'One more table', 'database', () => element('Entity', { name: 'table_name' }, [element('Attr', { name: 'id', type: 'text', pk: 'true' })])),
  row('attr', 'Entity', 'Field', 'One more field', 'key', () => element('Attr', { name: 'column', type: 'text' })),
  row('relation', 'DataModel', 'Relation', 'How two tables link', 'branch', () => element('Relation', { from: 'parent', to: 'child', kind: '1-n' })),
  row('note', 'AnnotatedCode', 'Note', 'A note on a line', 'message', () => element('Note', { lines: '1' }, [text('What this line does.')])),
  row('tab', 'Tabs', 'Tab', 'One more tab', 'list', () => element('Tab', { label: 'New tab' }, [text('What this tab shows.')])),
  row('pane', 'Compare', 'Pane', 'One more pane', 'branch', () => element('Pane', { label: 'New pane' }, [text('What this pane shows.')])),
  row('prop', 'Properties', 'Property', 'One more label and value', 'list', () => element('Prop', { label: 'Label' }, [text('Value')])),
  {
    key: 'option',
    section: 'In this card',
    label: 'Option',
    hint: 'One more option for a choice',
    icon: 'branch',
    keywords: ['option'],
    nested: true,
    build: () => element('plan-option', { id: shortId('option'), label: 'New option' }, [text('What this option means.')]),
  },
  {
    key: 'field',
    section: 'In this card',
    label: 'Field',
    hint: 'One more field for a form',
    icon: 'wrench',
    keywords: ['field', 'input'],
    nested: true,
    build: () => element('field', { name: shortId('field'), label: 'New field', type: 'text' }),
  },
  {
    key: 'item',
    section: 'In this card',
    label: 'Item',
    hint: 'A question or checklist line',
    icon: 'message',
    keywords: ['item', 'line', 'question'],
    nested: true,
    build: () => element('item', {}, [text('New item')]),
  },
]

/**
 * Removing the typed "/query" can remove the text the caret was in, and a selection on a removed
 * node fails the whole update. Put the caret back at the end of the line when that happens.
 */
function caretBackInLine(line: string | null): void {
  const selection = $getSelection()
  const lost =
    !$isRangeSelection(selection) || $getNodeByKey(selection.anchor.key) === null || $getNodeByKey(selection.focus.key) === null
  if (!lost) return
  const node = line ? $getNodeByKey(line) : null
  if ($isElementNode(node)) node.selectEnd()
  else $setSelection(null)
}

/** The menu can lag a fast typist by a key, so drop whatever is left of "/query" before the caret. */
function removeSlashQuery(): void {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return
  const node = selection.anchor.getNode()
  if (!$isTextNode(node)) return
  const offset = selection.anchor.offset
  const before = node.getTextContent().slice(0, offset)
  const slash = before.lastIndexOf('/')
  if (slash >= 0 && /^\/\S*$/.test(before.slice(slash)) && (slash === 0 || /\s/.test(before[slash - 1] ?? ''))) {
    node.spliceText(slash, offset - slash, '', true)
  }
}

/**
 * "Tiny /h2" leaves "Tiny " once the "/h2" goes. When the line becomes another block, the space
 * that came before the "/" goes too. A link or image keeps it: it sits after that space.
 */
function dropSpaceBeforeCaret(): void {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return
  const node = selection.anchor.getNode()
  const offset = selection.anchor.offset
  if (!$isTextNode(node) || offset !== node.getTextContentSize() || offset === 0) return
  if (/\s/.test(node.getTextContent()[offset - 1] ?? '')) node.spliceText(offset - 1, 1, '', true)
}

/** Put a code block where the "/" line was (or after it, when it still has text), and type in it. */
function insertFence(line: string | null, fence: { language: string; code: string }): void {
  const block = $createCodeBlockNode({ code: fence.code, language: fence.language, meta: '' })
  const target = line ? $getNodeByKey(line) : null
  // The caret moves into the code editor, so the plan's editor lets go of it first: a caret left in
  // the replaced line would point at a removed node.
  $setSelection(null)
  if ($isParagraphNode(target) && target.getTextContent() === '') target.replace(block)
  else if (target) target.insertAfter(block)
  else $getRoot().append(block)
  focusFenceWhenReady(block.getKey())
}

type Point = { key: string; offset: number; type: 'text' | 'element' }

/** Where the caret is, to come back to after the link or image form. */
function $caretPoint(): Point | null {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return null
  const { key, offset, type } = selection.anchor
  return { key, offset, type }
}

/** Put the caret back where the "/" was, or at the end of its line if that text is gone. */
function $caretBack(point: Point | null, line: string | null): void {
  if (point && $getNodeByKey(point.key)) {
    const selection = $createRangeSelection()
    selection.anchor.set(point.key, point.offset, point.type)
    selection.focus.set(point.key, point.offset, point.type)
    $setSelection(selection)
    return
  }
  const node = line ? $getNodeByKey(line) : null
  if ($isElementNode(node)) node.selectEnd()
  else $getRoot().selectEnd()
}

/** Add the link or image at the caret. */
function $insertAtCaret(kind: InsertKind, values: InsertValues): void {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return
  if (kind === 'link') {
    const link = $createLinkNode(values.url)
    link.append($createTextNode(values.text || values.url))
    selection.insertNodes([link])
  } else {
    selection.insertNodes([$createImageNode({ src: values.url, altText: values.text })])
  }
}

/** The line the menu was opened on, in the viewport, for the link or image form to sit under. */
function lineRect(editor: LexicalEditor, line: string | null): DOMRect {
  const element = line ? editor.getElementByKey(line) : null
  return (element ?? editor.getRootElement())?.getBoundingClientRect() ?? new DOMRect(16, 16, 0, 0)
}

class CardOption extends MenuOption {
  card: Card
  constructor(card: Card) {
    super(card.key)
    this.card = card
  }
}

/** The menu's options for a query, in its order. */
function menuOptions(nested: boolean, query: string, parent?: string | null): CardOption[] {
  return SLASH_CARDS.filter(
    (card) =>
      !card.agentOnly &&
      (nested || !card.nested) &&
      (!card.parents || (parent != null && card.parents.includes(parent))) &&
      matches(card, query),
  ).map((card) => new CardOption(card))
}

/** The query after a "/" right before the caret (the menu's trigger), or null when there is none. */
function $slashQueryAtCaret(): string | null {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null
  const node = selection.anchor.getNode()
  if (!$isTextNode(node)) return null
  const match = /(?:^|\s)\/(\S{0,24})$/.exec(node.getTextContent().slice(0, selection.anchor.offset))
  return match ? (match[1] ?? '') : null
}

function matches(card: Card, query: string): boolean {
  if (!query) return true
  const needle = query.toLowerCase()
  return card.label.toLowerCase().includes(needle) || card.keywords.some((word) => word.startsWith(needle))
}

function SlashMenu({ nested, parent }: { nested: boolean; parent?: string | null }) {
  const [editor] = useLexicalComposerContext()
  const insertJsx = usePublisher(insertJsx$)
  const insertTable = usePublisher(insertTable$)
  const setActiveEditor = usePublisher(activeEditor$)
  const [query, setQuery] = useState<string | null>(null)
  const open = useRef(false)
  const highlighted = useRef(0)
  const shownQuery = useRef<string | null>(null)
  const selectAndClose = useRef<((option: CardOption) => void) | null>(null)
  const [prompt, setPrompt] = useState<{ kind: InsertKind; point: Point | null; line: string | null; anchor: DOMRect } | null>(null)
  const trigger = useBasicTypeaheadTriggerMatch('/', { minLength: 0, maxLength: 24 })
  const options = useMemo(() => menuOptions(nested, query ?? '', parent), [nested, query, parent])

  // Escape on a line that holds only the `/` (as the + under a block leaves it) empties the line.
  useEffect(
    () =>
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        () => {
          const selection = $getSelection()
          if (!$isRangeSelection(selection)) return false
          const line = selection.anchor.getNode().getTopLevelElement()
          if ($isParagraphNode(line) && line.getTextContent() === '/') {
            line.clear()
            line.select()
          }
          // The menu still closes itself.
          return false
        },
        COMMAND_PRIORITY_NORMAL,
      ),
    [editor],
  )

  // The editor adds a card once it has focus, which can take a few frames, and splits the "/" line
  // around it. When the card appears, the empty line before it goes away, so the card takes the
  // line's place; the empty line after it keeps the caret. `line` is read late: the update that
  // finds it runs after this menu's own update.
  const removeEmptiedLine = useCallback(
    (line: () => string | null) => {
      const known = new Set(editor.getEditorState().read(() => $getRoot().getChildrenKeys()))
      const stop = editor.registerUpdateListener(({ editorState }) => {
        const card = editorState.read(
          () => $getRoot().getChildren().find((node) => $isDecoratorNode(node) && !known.has(node.getKey()))?.getKey() ?? null,
        )
        if (!card) return
        stop()
        clearTimeout(timer)
        editor.update(() => {
          const before = $getNodeByKey(card)?.getPreviousSibling()
          const ours = before && (before.getKey() === line() || !known.has(before.getKey()))
          if (ours && $isParagraphNode(before) && before.getTextContent() === '') before.remove()
        })
      })
      const timer = setTimeout(stop, 1000)
    },
    [editor],
  )

  const pick = useRef<(option: CardOption, typed: string) => void>(() => {})

  // The menu takes Enter and Tab itself. Inside a card's body the editor would otherwise also start
  // a new line first, and the menu would no longer find the "/query" it replaces.
  useEffect(() => {
    const take = (event: KeyboardEvent | null) => {
      if (!open.current) return false
      // Read the query from the text: a fast typist can press Enter before the menu shows the last key.
      const typed = editor.getEditorState().read($slashQueryAtCaret)
      if (typed === null) return false
      const list = menuOptions(nested, typed, parent)
      const option = list[typed === shownQuery.current ? highlighted.current : 0]
      if (!option) return false
      event?.preventDefault()
      event?.stopImmediatePropagation()
      pick.current(option, typed)
      return true
    }
    const enter = editor.registerCommand(KEY_ENTER_COMMAND, take, COMMAND_PRIORITY_HIGH)
    const tab = editor.registerCommand(KEY_TAB_COMMAND, take, COMMAND_PRIORITY_HIGH)
    return () => {
      enter()
      tab()
    }
  }, [editor, nested, parent])

  const onSelect = useCallback(
    (option: CardOption, typed: { remove: () => void } | null, close: () => void) => {
      const { build, fence, block, prompt: ask, table } = option.card
      let line: string | null = null
      let point: Point | null = null
      editor.update(
        () => {
          // The line first: removing the typed "/query" can take the caret out of it.
          const at = $getSelection()
          if ($isRangeSelection(at)) line = at.anchor.getNode().getTopLevelElement()?.getKey() ?? null
          typed?.remove()
          caretBackInLine(line)
          removeSlashQuery()
          if (fence) insertFence(line, fence)
          else if (block) {
            dropSpaceBeforeCaret()
            $setBlocksType($getSelection(), block)
          }
          else if (ask) point = $caretPoint()
        },
        { discrete: true },
      )
      close()
      if (ask) {
        // The update above runs after this one, so read what it found on the next frame.
        requestAnimationFrame(() => setPrompt({ kind: ask, point, line, anchor: lineRect(editor, line) }))
        return
      }
      if (table) {
        setActiveEditor(editor)
        insertTable(table)
        removeEmptiedLine(() => line)
        return
      }
      if (fence || !build) return
      const node = build()
      // The card goes into the editor the "/" was typed in, also a card's body.
      setActiveEditor(editor)
      insertJsx({
        kind: 'flow',
        name: node.name ?? '',
        props: Object.fromEntries(
          node.attributes.flatMap((attribute) =>
            attribute.type === 'mdxJsxAttribute' && typeof attribute.value === 'string' ? [[attribute.name, attribute.value]] : [],
          ),
        ),
        children: node.children,
      })
      removeEmptiedLine(() => line)
    },
    [editor, insertJsx, insertTable, removeEmptiedLine, setActiveEditor],
  )
  // Picked with Enter or Tab: through the menu, so it closes too. A key typed just before may not be on
  // screen yet, so wait a frame or two for the menu to show it.
  pick.current = (option, typed) => {
    open.current = false
    let frames = 0
    const attempt = () => {
      const select = shownQuery.current === typed ? selectAndClose.current : null
      if (select) select(option)
      else if (frames++ < 3) requestAnimationFrame(attempt)
      else onSelect(option, null, () => {})
    }
    attempt()
  }

  const closePrompt = (values: InsertValues | null) => {
    if (!prompt) return
    setPrompt(null)
    editor.update(
      () => {
        $caretBack(prompt.point, prompt.line)
        if (values) $insertAtCaret(prompt.kind, values)
      },
      { discrete: true },
    )
    editor.focus()
    // A card's body tells the plan about its text through its card.
    if (values) editor.dispatchCommand(NESTED_EDITOR_UPDATED_COMMAND, undefined)
  }

  return (
    <>
    {prompt ? (
      <InsertPrompt kind={prompt.kind} anchor={prompt.anchor} onSubmit={(values) => closePrompt(values)} onCancel={() => closePrompt(null)} />
    ) : null}
    <LexicalTypeaheadMenuPlugin<CardOption>
      onQueryChange={(next) => {
        open.current = next !== null
        if (next === null) selectAndClose.current = null
        setQuery(next)
      }}
      onSelectOption={onSelect}
      triggerFn={trigger}
      options={options}
      menuRenderFn={(anchor, { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }) => {
        highlighted.current = selectedIndex ?? 0
        shownQuery.current = query
        selectAndClose.current = selectOptionAndCleanUp
        return (
        anchor.current && options.length > 0
          ? createPortal(
              <div className="plan-slash-menu" role="listbox" aria-label="Add a block" data-plan-grab-ignore="">
                {options.map((option, index) => (
                  <Fragment key={option.key}>
                    {option.card.section !== options[index - 1]?.card.section ? (
                      <div className="plan-slash-section" role="presentation" data-slash-section={option.card.section}>
                        {option.card.section}
                      </div>
                    ) : null}
                    <div
                      ref={(element) => option.setRefElement(element)}
                      role="option"
                      aria-selected={selectedIndex === index}
                      className="plan-slash-item"
                      data-slash-card={option.card.key}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      onMouseDown={(event) => {
                        event.preventDefault()
                        setHighlightedIndex(index)
                        selectOptionAndCleanUp(option)
                      }}
                    >
                      <CardLabel icon={option.card.icon}>{option.card.label}</CardLabel>
                      <span className="plan-slash-hint">{option.card.hint}</span>
                    </div>
                  </Fragment>
                ))}
              </div>,
              anchor.current,
            )
          : null
        )
      }}
    />
    </>
  )
}

function RootSlashMenu() {
  return <SlashMenu nested={false} />
}

function NestedSlashMenu() {
  // The card this body belongs to, so its own rows (a FileTree's File) are offered.
  const context = useContext(NestedEditorsContext)
  const name = (context?.mdastNode as { name?: string | null } | undefined)?.name ?? null
  return <SlashMenu nested parent={name} />
}

/**
 * Type `/` to add a block: text, headings, a quote, a link, an image, code, a diagram, or a card,
 * listed in sections. Arrow keys move, Enter or Tab adds, Escape closes.
 */
export const slashMenuPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addComposerChild$]: RootSlashMenu,
      [addNestedEditorChild$]: NestedSlashMenu,
    })
  },
})
