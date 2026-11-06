import { ExternalLink, FileText, MoreHorizontal, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PlanVersionsSubmenu } from '../../client/chrome/PlanVersionsMenu.tsx'
import { Button } from '../../client/ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../client/ui/dropdown-menu.tsx'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../client/ui/tooltip.tsx'

type PlanRowActionsProps = {
  openUrl?: string
  fileUrl?: string
  offline?: boolean
  planId?: string
  showVersions?: boolean
  /** Hide the plan from the dashboard. The menu shows Delete only when this is set. */
  onDelete?: () => void
}

const MORE_LABEL = 'More actions'

function OpenLink({ href }: { href: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button variant="ghost" className="plan-action" aria-label="Open" nativeButton={false} render={<a href={href} />} />}
      >
        <ExternalLink size={16} aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>Open</TooltipContent>
    </Tooltip>
  )
}

function MoreMenu({ fileUrl, offline, planId, showVersions, onDelete }: PlanRowActionsProps) {
  const [open, setOpen] = useState(false)
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip disabled={open}>
        <TooltipTrigger
          render={<DropdownMenuTrigger aria-label={MORE_LABEL} render={<Button variant="ghost" className="plan-action" />} />}
        >
          <MoreHorizontal size={16} aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>{MORE_LABEL}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent>
        {fileUrl ? (
          offline ? (
            <DropdownMenuItem disabled title="Needs a connection">
              <span className="plan-menu-label">
                <FileText size={16} aria-hidden="true" />
                Plan file
              </span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuLinkItem href={fileUrl}>
              <span className="plan-menu-label">
                <FileText size={16} aria-hidden="true" />
                Plan file
              </span>
            </DropdownMenuLinkItem>
          )
        ) : null}
        {showVersions && planId ? <PlanVersionsSubmenu planId={planId} /> : null}
        {onDelete ? (
          <>
            {fileUrl || (showVersions && planId) ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem className="plan-menu-danger" disabled={offline} onClick={onDelete}>
              <span className="plan-menu-label">
                <Trash2 size={16} aria-hidden="true" />
                Delete
              </span>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Server render shows the trigger only. The menu mounts after hydration, so its ids and portal match. */
function MoreMenuMount(props: PlanRowActionsProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])
  if (mounted) return <MoreMenu {...props} />
  return (
    <Button type="button" variant="ghost" className="plan-action" aria-label={MORE_LABEL} aria-haspopup="menu" aria-expanded={false}>
      <MoreHorizontal size={16} aria-hidden="true" />
    </Button>
  )
}

/** One dashboard row's actions: Open while the plan runs, and a menu with the plan file, versions, and Delete. */
export function PlanRowActions(props: PlanRowActionsProps) {
  const { openUrl, fileUrl, planId, showVersions = false, onDelete } = props
  const hasMenu = Boolean(fileUrl || (showVersions && planId) || onDelete)
  if (!openUrl && !hasMenu) return null
  return (
    <TooltipProvider>
      <div className="plan-actions">
        {openUrl ? <OpenLink href={openUrl} /> : null}
        {hasMenu ? <MoreMenuMount {...props} /> : null}
      </div>
    </TooltipProvider>
  )
}
