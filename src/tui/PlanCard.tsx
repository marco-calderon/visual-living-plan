import { Box, Progress, Text } from '@semos-labs/glyph'
import { useEffect, useRef } from 'react'
import type { TextHandle } from '@semos-labs/glyph'
import type { PlanRecord } from '../processRecord.js'
import {
  STATUS_LABEL,
  completionDetail,
  formatDuration,
  formatWhen,
  gitLine,
  planSubtitle,
} from './dashboardView.js'
import { palette } from './palette.js'
import { PlanActions } from './PlanActions.js'

type PlanCardProps = {
  plan: PlanRecord
  selected: boolean
  hovered: boolean
  openUrl: string | null
  archive: string | null
  onSelect: () => void
  onHover: () => void
  onOpen: (url: string) => void
}

export function PlanCard({ plan, selected, hovered, openUrl, archive, onSelect, onHover, onOpen }: PlanCardProps) {
  const completion = completionDetail(plan)
  const statusColor =
    plan.status === 'executed' ? palette.good : plan.status === 'interrupted' ? palette.warn : palette.accent
  const anchor = useRef<TextHandle>(null)

  useEffect(() => {
    if (selected) anchor.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  return (
    <Box
      onClick={onSelect}
      onMouseEnter={onHover}
      style={{
        flexDirection: 'column',
        border: 'round',
        borderColor: selected ? palette.accent : palette.line,
        bg: selected ? palette.accentSoft : hovered ? palette.hover : palette.panel,
        paddingX: 1,
        paddingY: 0,
        gap: 0,
      }}
    >
      <Box style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 1 }}>
        <Text ref={anchor} style={{ bold: true, color: palette.ink }}>
          {selected ? '▸ ' : ''}
          {plan.title || 'Untitled plan'}
        </Text>
        <Text style={{ bold: true, color: statusColor }}>{STATUS_LABEL[plan.status] ?? plan.status}</Text>
      </Box>
      <Text style={{ color: palette.muted }}>{planSubtitle(plan)}</Text>
      {plan.planPath ? <Text style={{ color: palette.muted }} wrap="ellipsis">{plan.planPath}</Text> : null}
      <Box style={{ width: 24 }}>
        <Progress value={completion.ratio / 100} showPercent style={{ color: palette.accent }} />
      </Box>
      <Text style={{ color: palette.muted }}>{completion.counts}</Text>
      {plan.directory ? <Text wrap="ellipsis">{plan.directory}</Text> : null}
      {gitLine(plan) ? <Text style={{ color: palette.muted }}>{gitLine(plan)}</Text> : null}
      <Text style={{ color: palette.ink }}>
        {String(plan.filesModified ?? 0)} files · {formatWhen(plan.startedAt)} · {formatDuration(plan.durationMs)}
      </Text>
      {plan.status === 'running' ? <Text style={{ color: palette.muted }}>{plan.pendingCount} pending</Text> : null}
      <PlanActions openUrl={openUrl} archive={archive} onOpen={onOpen} />
    </Box>
  )
}
