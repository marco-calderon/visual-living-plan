import type { ReactNode } from 'react'

/** Read the text a shipped MDX component received, including fenced code children. */
export function collectText(children: ReactNode): string {
  if (children == null || typeof children === 'boolean') return ''
  if (typeof children === 'string' || typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map((child) => collectText(child)).join('')
  if (typeof children === 'object' && 'props' in children) {
    const props = (children as { props?: { children?: ReactNode } }).props
    return collectText(props?.children)
  }
  return ''
}
