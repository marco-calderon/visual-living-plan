import { addComposerChild$, addNestedEditorChild$, insertJsx$, realmPlugin, usePublisher } from '@mdxeditor/editor'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getNodeByKey,
  $getSelection,
  $isDecoratorNode,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_NORMAL,
  KEY_ESCAPE_COMMAND,
} from 'lexical'
import { LexicalTypeaheadMenuPlugin, MenuOption, useBasicTypeaheadTriggerMatch } from '@lexical/react/LexicalTypeaheadMenuPlugin'
import type { MdxJsxAttribute, MdxJsxFlowElement } from 'mdast-util-mdx-jsx'
import type { Paragraph } from 'mdast'
import { Type } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { CardLabel, type CardIcon } from '../entries/CardLabel.tsx'

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
  /** The card to add. Without one the line stays a paragraph. */
  build?: () => MdxJsxFlowElement
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

class CardOption extends MenuOption {
  card: Card
  constructor(card: Card) {
    super(card.key)
    this.card = card
  }
}

function matches(card: Card, query: string): boolean {
  if (!query) return true
  const needle = query.toLowerCase()
  return card.label.toLowerCase().includes(needle) || card.keywords.some((word) => word.startsWith(needle))
}

function SlashMenu({ nested }: { nested: boolean }) {
  const [editor] = useLexicalComposerContext()
  const insertJsx = usePublisher(insertJsx$)
  const [query, setQuery] = useState<string | null>(null)
  const trigger = useBasicTypeaheadTriggerMatch('/', { minLength: 0, maxLength: 24 })
  const options = useMemo(
    () =>
      SLASH_CARDS.filter((card) => !card.agentOnly && (nested || !card.nested) && matches(card, query ?? '')).map(
        (card) => new CardOption(card),
      ),
    [nested, query],
  )

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

  const onSelect = useCallback(
    (option: CardOption, typed: { remove: () => void } | null, close: () => void) => {
      let line: string | null = null
      editor.update(
        () => {
          typed?.remove()
          const at = $getSelection()
          if ($isRangeSelection(at)) line = at.anchor.getNode().getTopLevelElement()?.getKey() ?? null
          // The menu can lag a fast typist by a key, so drop whatever is left of "/query" before the caret.
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
        },
        { discrete: true },
      )
      close()
      if (!option.card.build) return
      const node = option.card.build()
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
      // The card goes after the line the "/" was typed on. A line left empty by that goes away,
      // so the card takes its place.
      requestAnimationFrame(() => {
        editor.update(() => {
          const emptied = line ? $getNodeByKey(line) : null
          if ($isParagraphNode(emptied) && emptied.getTextContent() === '' && $isDecoratorNode(emptied.getNextSibling())) emptied.remove()
        })
      })
    },
    [editor, insertJsx],
  )

  return (
    <LexicalTypeaheadMenuPlugin<CardOption>
      onQueryChange={setQuery}
      onSelectOption={onSelect}
      triggerFn={trigger}
      options={options}
      menuRenderFn={(anchor, { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }) =>
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
      }
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
