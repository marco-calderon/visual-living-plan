import { memo, useState } from 'react'
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from '../ui/collapsible.tsx'

const TriggerFace = memo(function TriggerFace({ html }: { html: string }) {
  return <span className="plan-chrome-contents" dangerouslySetInnerHTML={{ __html: html }} />
})

export function SettingsAccordion({
  triggerId,
  panelId,
  triggerHtml,
  panelHtml,
}: {
  triggerId: string
  panelId: string
  triggerHtml: string
  panelHtml: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <Collapsible className="settings-accordion" data-accordion="" open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        id={triggerId}
        className="settings-accordion-trigger"
        data-accordion-trigger=""
      >
        <TriggerFace html={triggerHtml} />
      </CollapsibleTrigger>
      <CollapsiblePanel
        id={panelId}
        className="settings-accordion-panel"
        data-accordion-panel=""
        keepMounted
        inert={!open}
      >
        <div className="settings-accordion-panel-inner" dangerouslySetInnerHTML={{ __html: panelHtml }} />
      </CollapsiblePanel>
    </Collapsible>
  )
}
