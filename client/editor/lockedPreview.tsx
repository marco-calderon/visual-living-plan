import type { Element, Root as HastRoot } from 'hast'
import { toJsxRuntime, type Components } from 'hast-util-to-jsx-runtime'
import type { RootContent } from 'mdast'
import type { MdxJsxFlowElement, MdxJsxTextElement } from 'mdast-util-mdx-jsx'
import { toHast } from 'mdast-util-to-hast'
import type { ComponentProps, ComponentType, ReactNode } from 'react'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import { Approve } from '../entries/Approve.tsx'
import { Choice } from '../entries/Choice.tsx'
import { Form } from '../entries/Form.tsx'
import { Field, Item } from '../entries/mdxEntries.tsx'
import { Option } from '../entries/Option.tsx'
import { Questions } from '../entries/Questions.tsx'
import { EDITOR_TAG_NAMES } from '../../src/planMdx/editSource.ts'

type JsxNode = MdxJsxFlowElement | MdxJsxTextElement

/** What a locked card says where the page would say a run is going on. */
export const LOCKED_STATE = 'Locked in the editor: answered on the page'

const FILE_NAME: Record<string, string> = Object.fromEntries(Object.entries(EDITOR_TAG_NAMES).map(([file, editor]) => [editor, file]))

function locked<P extends { locked?: boolean; lockedState?: string }>(Component: ComponentType<P>) {
  function Locked(props: P) {
    return <Component {...props} locked lockedState={LOCKED_STATE} />
  }
  Locked.displayName = `Locked${Component.displayName ?? Component.name}`
  return Locked
}

/**
 * The page's own cards, locked: they show their fields, options, and questions as the page does,
 * with every control disabled. Rows use the same readers as the page for their string props.
 */
const PREVIEW: Record<string, ComponentType<never>> = {
  form: locked(Form as ComponentType<ComponentProps<typeof Form>>),
  questions: locked(Questions as ComponentType<ComponentProps<typeof Questions>>),
  choice: locked(Choice as ComponentType<ComponentProps<typeof Choice>>),
  approve: locked(Approve as ComponentType<ComponentProps<typeof Approve>>),
  field: Field,
  item: Item,
  option: Option,
} as Record<string, ComponentType<never>>

/** Whether a tag, by its file or editing name, has a page card to show while locked. */
export function hasLockedPreview(tag: string): boolean {
  return (FILE_NAME[tag] ?? tag) in PREVIEW
}

/** The node and its children with their file names, so they match the page's components. */
function withFileNames<T extends RootContent | JsxNode>(node: T): T {
  const next = { ...node } as T & { name?: string | null; children?: RootContent[] }
  if (typeof next.name === 'string') next.name = FILE_NAME[next.name] ?? next.name
  if (Array.isArray(next.children)) next.children = next.children.map((child) => withFileNames(child))
  return next
}

/**
 * The card as the page draws it, from the plan's markdown, or null when it holds something only
 * the page's compiler can read (an `{expression}` prop). The editor then shows its own disabled card.
 */
export function renderLockedPreview(node: JsxNode): ReactNode | null {
  try {
    const hast = toHast(
      { type: 'root', children: [withFileNames(node) as RootContent] },
      { passThrough: ['mdxJsxFlowElement', 'mdxJsxTextElement'] },
    ) as HastRoot | Element
    return toJsxRuntime(hast as HastRoot, {
      Fragment,
      jsx,
      jsxs,
      components: PREVIEW as unknown as Partial<Components>,
      elementAttributeNameCase: 'react',
      stylePropertyNameCase: 'dom',
    })
  } catch {
    return null
  }
}
