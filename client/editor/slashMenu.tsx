import { $createCodeBlockNode, activeEditor$, addComposerChild$, addNestedEditorChild$, insertJsx$, realmPlugin, usePublisher } from '@mdxeditor/editor'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
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
} from 'lexical'
import { LexicalTypeaheadMenuPlugin, MenuOption, useBasicTypeaheadTriggerMatch } from '@lexical/react/LexicalTypeaheadMenuPlugin'
import type { MdxJsxAttribute, MdxJsxFlowElement } from 'mdast-util-mdx-jsx'
import type { Paragraph } from 'mdast'
import { Code, Type, Workflow } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CardLabel, type CardIcon } from '../entries/CardLabel.tsx'
import { focusFenceWhenReady } from './codeFence.tsx'

type Card = {
  key: string
  label: string
  hint: string
  icon: CardIcon
  /** Words that also find this card. */
  keywords: string[]
  /** Rows only make sense inside a card. */
  nested?: boolean
  /**
   * Cards the agent writes for the person to answer (decisions, choices, forms, questions,
   * approvals). The editor still edits them where the plan has them, but the menu does not offer them.
   */
  agentOnly?: boolean
  /** The card to add. Without one (and without a fence) the line stays a paragraph. */
  build?: () => MdxJsxFlowElement
  /** A fenced code block to add instead of a card. */
  fence?: { language: string; code: string }
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

function callout(kind: string, icon: string, label: string, agentOnly = false): Card {
  return {
    key: `callout-${kind}`,
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
    label: 'Text',
    hint: 'A paragraph to write in',
    icon: <Type size={16} strokeWidth={2} />,
    keywords: ['text', 'paragraph', 'plain'],
  },
  {
    key: 'code',
    label: 'Code',
    hint: 'A code block with syntax highlighting',
    icon: <Code size={16} strokeWidth={2} />,
    keywords: ['code', 'snippet', 'fence', 'block'],
    fence: { language: 'ts', code: '' },
  },
  {
    key: 'mermaid',
    label: 'Mermaid',
    hint: 'A diagram drawn from mermaid code',
    icon: <Workflow size={16} strokeWidth={2} />,
    keywords: ['mermaid', 'diagram', 'chart', 'flowchart'],
    fence: { language: 'mermaid', code: 'flowchart LR\n  A[Start] --> B[Finish]' },
  },
  {
    key: 'phase',
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
    agentOnly: true,
    label: 'Approval',
    hint: 'A yes or no gate',
    icon: 'check',
    keywords: ['approve', 'approval', 'gate', 'yes', 'no'],
    build: () => element('approve', { id: shortId('approve'), prompt: 'Proceed?' }, [text('What happens after approval.')]),
  },
  {
    key: 'checklist',
    label: 'Checklist',
    hint: 'Lines the agent ticks off',
    icon: 'list',
    keywords: ['checklist', 'todo', 'done'],
    build: () => element('checklist', { id: shortId('checklist'), title: 'Done when' }, [element('item', { done: 'false' }, [text('First check')])]),
  },
  {
    key: 'option',
    label: 'Option',
    hint: 'One more option for a choice',
    icon: 'branch',
    keywords: ['option'],
    nested: true,
    build: () => element('plan-option', { id: shortId('option'), label: 'New option' }, [text('What this option means.')]),
  },
  {
    key: 'field',
    label: 'Field',
    hint: 'One more field for a form',
    icon: 'wrench',
    keywords: ['field', 'input'],
    nested: true,
    build: () => element('field', { name: shortId('field'), label: 'New field', type: 'text' }),
  },
  {
    key: 'item',
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

class CardOption extends MenuOption {
  card: Card
  constructor(card: Card) {
    super(card.key)
    this.card = card
  }
}

/** The menu's options for a query, in its order. */
function menuOptions(nested: boolean, query: string): CardOption[] {
  return SLASH_CARDS.filter((card) => !card.agentOnly && (nested || !card.nested) && matches(card, query)).map((card) => new CardOption(card))
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

function SlashMenu({ nested }: { nested: boolean }) {
  const [editor] = useLexicalComposerContext()
  const insertJsx = usePublisher(insertJsx$)
  const setActiveEditor = usePublisher(activeEditor$)
  const [query, setQuery] = useState<string | null>(null)
  const open = useRef(false)
  const highlighted = useRef(0)
  const shownQuery = useRef<string | null>(null)
  const selectAndClose = useRef<((option: CardOption) => void) | null>(null)
  const trigger = useBasicTypeaheadTriggerMatch('/', { minLength: 0, maxLength: 24 })
  const options = useMemo(() => menuOptions(nested, query ?? ''), [nested, query])

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
      const list = menuOptions(nested, typed)
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
  }, [editor, nested])

  const onSelect = useCallback(
    (option: CardOption, typed: { remove: () => void } | null, close: () => void) => {
      const { build, fence } = option.card
      let line: string | null = null
      editor.update(
        () => {
          // The line first: removing the typed "/query" can take the caret out of it.
          const at = $getSelection()
          if ($isRangeSelection(at)) line = at.anchor.getNode().getTopLevelElement()?.getKey() ?? null
          typed?.remove()
          caretBackInLine(line)
          removeSlashQuery()
          if (fence) insertFence(line, fence)
        },
        { discrete: true },
      )
      close()
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
    [editor, insertJsx, removeEmptiedLine, setActiveEditor],
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

  return (
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
              <div className="plan-slash-menu" role="listbox" aria-label="Add a card" data-plan-grab-ignore="">
                {options.map((option, index) => (
                  <div
                    key={option.key}
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
                ))}
              </div>,
              anchor.current,
            )
          : null
        )
      }}
    />
  )
}

function RootSlashMenu() {
  return <SlashMenu nested={false} />
}

function NestedSlashMenu() {
  return <SlashMenu nested />
}

/** Type `/` to add a card. Arrow keys move, Enter or Tab adds, Escape closes. */
export const slashMenuPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addComposerChild$]: RootSlashMenu,
      [addNestedEditorChild$]: NestedSlashMenu,
    })
  },
})
