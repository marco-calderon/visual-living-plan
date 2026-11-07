import { FileText, MoreHorizontal, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PlanVersionsSubmenu } from '../../client/chrome/PlanVersionsMenu.tsx'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../client/ui/alert-dialog.tsx'
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
  fileUrl?: string
  offline?: boolean
  planId?: string
  /** Named in the delete confirmation. */
  title?: string
  showVersions?: boolean
  /** Hide the plan from the dashboard. Resolves false when the request failed. The menu shows Delete only when this is set. */
  onDelete?: () => Promise<boolean>
}

const MORE_LABEL = 'More actions'

function DeleteDialog({
  open,
  onOpenChange,
  title,
  onDelete,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  onDelete: () => Promise<boolean>
}) {
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (open) setFailed(false)
  }, [open])

  async function confirm() {
    setPending(true)
    setFailed(false)
    const ok = await onDelete().catch(() => false)
    setPending(false)
    if (ok) onOpenChange(false)
    else setFailed(true)
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this plan?</AlertDialogTitle>
          <AlertDialogDescription>
            “{title}” will be closed and its saved versions deleted, which frees their storage. The file on your machine stays,
            and serving it again starts the plan fresh.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failed ? (
          <p className="plan-alert-error" role="alert">
            Could not delete the plan. Try again.
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="tertiary" className="plan-btn-destructive" disabled={pending} onClick={() => void confirm()}>
            {pending ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function MoreMenu({ fileUrl, offline, planId, title, showVersions, onDelete }: PlanRowActionsProps) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  return (
    <>
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
              <DropdownMenuItem className="plan-menu-danger" disabled={offline} onClick={() => setConfirming(true)}>
                <span className="plan-menu-label">
                  <Trash2 size={16} aria-hidden="true" />
                  Delete
                </span>
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {onDelete ? (
        <DeleteDialog open={confirming} onOpenChange={setConfirming} title={title || 'Untitled plan'} onDelete={onDelete} />
      ) : null}
    </>
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

/** One dashboard row's actions: a menu with the plan file, versions, and Delete. The plan title opens the plan. */
export function PlanRowActions(props: PlanRowActionsProps) {
  const { fileUrl, planId, showVersions = false, onDelete } = props
  if (!fileUrl && !(showVersions && planId) && !onDelete) return null
  return (
    <TooltipProvider>
      <div className="plan-actions">
        <MoreMenuMount {...props} />
      </div>
    </TooltipProvider>
  )
}
