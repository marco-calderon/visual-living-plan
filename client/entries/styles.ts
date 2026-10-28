import type { HTMLAttributes, ReactNode } from 'react'
import './primitives.css'

export type Gap = 'xs' | 'sm' | 'md' | 'lg'
export type Align = 'start' | 'center' | 'end' | 'stretch' | 'baseline'
export type Justify = 'start' | 'center' | 'end' | 'between' | 'around'
export type StackTag = 'div' | 'ul' | 'ol'

export type StackProps = {
  as?: StackTag
  children?: ReactNode
  className?: string
  gap?: Gap
  align?: Align
  justify?: Justify
  wrap?: boolean
} & Omit<HTMLAttributes<HTMLElement>, 'className' | 'children'>

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
