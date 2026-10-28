import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'

const ENTRY_KIND = Symbol.for('visual-living-plan.entry')

type Marked = {
  [ENTRY_KIND]?: string
}

export function markEntry<T>(component: T, kind: string): T {
  ;(component as Marked)[ENTRY_KIND] = kind
  return component
}

export function entryKindOf(type: unknown): string | undefined {
  if (type === null || (typeof type !== 'function' && typeof type !== 'object')) return undefined
  const kind = (type as Marked)[ENTRY_KIND]
  return typeof kind === 'string' ? kind : undefined
}

export function anchorId(id?: string): string | undefined {
  return id ? `plan-${id}` : undefined
}

export function partitionEntries(
  children: ReactNode,
  kind: string,
): { matches: ReactElement[]; rest: ReactNode[] } {
  const matches: ReactElement[] = []
  const rest: ReactNode[] = []
  Children.forEach(children, (child) => {
    if (isValidElement(child) && entryKindOf(child.type) === kind) matches.push(child)
    else rest.push(child)
  })
  return { matches, rest }
}

export function keyedEntries(elements: ReactElement[], prefix: string): ReactElement[] {
  return elements.map((element, index) =>
    element.key != null ? element : cloneElement(element, { key: `${prefix}-${index}` }),
  )
}

export function indexItems(elements: ReactElement[], start = 0): ReactElement[] {
  let index = start
  return elements.map((element) => {
    const props = element.props as { index?: number }
    const itemIndex = props.index ?? index
    index += 1
    const key = element.key ?? `item-${itemIndex}`
    return cloneElement(element as ReactElement<{ index?: number }>, { index: itemIndex, key })
  })
}
