import { memo, useLayoutEffect } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover.tsx'

const StableHtml = memo(function StableHtml({
  html,
  as: Tag,
}: {
  html: string
  as: 'div' | 'span'
}) {
  return <Tag className="plan-chrome-contents" dangerouslySetInnerHTML={{ __html: html }} />
})

export function PlanDetails({
  label,
  faceHtml,
  cardHtml,
}: {
  label: string
  faceHtml: string
  cardHtml: string
}) {
  useLayoutEffect(() => {
    document.querySelector('[data-plan-details-toggle]')?.setAttribute('aria-label', label)
  }, [label])

  return (
    <Popover modal={false}>
      <PopoverTrigger className="logo-btn" data-plan-details-toggle="" aria-controls="plan-card">
        <StableHtml as="span" html={faceHtml} />
      </PopoverTrigger>
      <PopoverContent
        id="plan-card"
        className="plan-card"
        side="bottom"
        align="start"
        sideOffset={9}
        collisionPadding={12}
        positionMethod="fixed"
        keepMounted
        data-plan-card=""
        aria-labelledby="plan-title"
      >
        <StableHtml as="div" html={cardHtml} />
      </PopoverContent>
    </Popover>
  )
}
