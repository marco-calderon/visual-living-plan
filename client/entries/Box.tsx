import { createElement, type HTMLAttributes, type ReactNode } from 'react'
import { cx } from './styles'

type BoxTag = 'div' | 'section' | 'form' | 'ul' | 'ol' | 'li'

export type BoxSurface = 'plain' | 'panel' | 'soft' | 'inset'
export type BoxPadding = 'none' | 'sm' | 'md' | 'lg'

export type BoxProps = {
  as?: BoxTag
  children?: ReactNode
  className?: string
  surface?: BoxSurface
  padding?: BoxPadding
} & Omit<HTMLAttributes<HTMLElement>, 'className' | 'children'>

export function Box({
  as = 'div',
  children,
  className,
  surface = 'plain',
  padding,
  ...rest
}: BoxProps) {
  return createElement(as, {
    ...rest,
    className: cx('plan-ui', 'plan-box', className),
    'data-surface': surface === 'plain' ? undefined : surface,
    'data-pad': padding,
    children,
  })
}
