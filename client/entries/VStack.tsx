import { createElement } from 'react'
import { cx, type StackProps } from './styles'

export function VStack({
  as = 'div',
  children,
  className,
  gap = 'md',
  align,
  justify,
  wrap,
  ...rest
}: StackProps) {
  return createElement(as, {
    ...rest,
    className: cx('plan-ui', 'plan-vstack', className),
    'data-gap': gap,
    'data-align': align,
    'data-justify': justify,
    'data-wrap': wrap ? 'true' : undefined,
    children,
  })
}
