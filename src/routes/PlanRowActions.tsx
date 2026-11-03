import { ExternalLink, FileText } from 'lucide-react'
import type { ReactNode } from 'react'
import { PlanVersionsMenuMount } from '../../client/chrome/PlanVersionsMenu.tsx'
import { Button } from '../../client/ui/button.tsx'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../client/ui/tooltip.tsx'

type PlanRowActionsProps = {
  openUrl?: string
  fileUrl?: string
  offline?: boolean
  planId?: string
  showVersions?: boolean
}

type IconLinkProps = {
  label: string
  href: string
  offline?: boolean
  children: ReactNode
}

function IconLink({ label, href, offline = false, children }: IconLinkProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            className="plan-action"
            aria-label={label}
            aria-disabled={offline ? true : undefined}
            nativeButton={offline ? undefined : false}
            render={offline ? undefined : <a href={href} />}
            onClick={
              offline
                ? (event) => {
                    event.preventDefault()
                  }
                : undefined
            }
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** Open, plan file, and versions for one dashboard row. Icons only; the name is the tooltip. */
export function PlanRowActions({ openUrl, fileUrl, offline = false, planId, showVersions = false }: PlanRowActionsProps) {
  if (!openUrl && !fileUrl && !showVersions) return null
  return (
    <TooltipProvider>
      <div className="plan-actions">
        {openUrl ? (
          <IconLink label="Open" href={openUrl}>
            <ExternalLink size={16} aria-hidden="true" />
          </IconLink>
        ) : null}
        {fileUrl ? (
          <IconLink label="Plan file" href={fileUrl} offline={offline}>
            <FileText size={16} aria-hidden="true" />
          </IconLink>
        ) : null}
        {showVersions && planId ? (
          <PlanVersionsMenuMount planId={planId} label="Versions" triggerClassName="" iconOnly />
        ) : null}
      </div>
    </TooltipProvider>
  )
}
