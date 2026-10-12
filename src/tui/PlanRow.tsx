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
import { planColumn } from './planColumns.js'

type PlanRowProps = {
  plan: PlanRecord
  selected: boolean
  hovered: boolean
  openUrl: string | null
  archive: string | null
  onSelect: () => void
  onHover: () => void
  onOpen: (url: string) => void
}

export function PlanRow({ plan, selected, hovered, openUrl, archive, onSelect, onHover, onOpen }: PlanRowProps) {
  const completion = completionDetail(plan)
  const tint = selected ? palette.accentSoft : hovered ? palette.hover : undefined
  const statusColor =
    plan.status === 'executed' ? palette.good : plan.status === 'interrupted' ? palette.warn : palette.accent
  const anchor = useRef<TextHandle>(null)

  useEffect(() => {
    if (selected) anchor.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  return (
    <Box style={{ flexDirection: 'column' }}>
      <Box
        onClick={onSelect}
        onMouseEnter={onHover}
        style={{
          flexDirection: 'row',
          gap: 1,
          bg: tint,
          paddingY: 0,
          alignItems: 'flex-start',
        }}
      >
        <Box style={{ ...planColumn.plan, flexDirection: 'column' }}>
          <Text ref={anchor} style={{ bold: true, color: palette.ink }}>
            {selected ? '▸ ' : ''}
            {plan.title || 'Untitled plan'}
          </Text>
          <Text style={{ color: palette.muted }}>{planSubtitle(plan)}</Text>
          {plan.planPath ? <Text style={{ color: palette.muted }}>{plan.planPath}</Text> : null}
        </Box>
        <Box style={{ ...planColumn.status, flexDirection: 'column' }}>
          <Text style={{ bold: true, color: statusColor }}>{STATUS_LABEL[plan.status] ?? plan.status}</Text>
          {plan.status === 'running' ? (
            <Text style={{ color: palette.muted }}>{plan.pendingCount} pending</Text>
          ) : null}
        </Box>
        <Box style={{ ...planColumn.completion, flexDirection: 'column' }}>
          <Progress
            value={completion.ratio / 100}
            filled="━"
            empty="─"
            style={{ color: palette.accent }}
          />
          <Text style={{ color: palette.ink }}>{completion.label}</Text>
          <Text style={{ color: palette.muted }}>{completion.counts}</Text>
        </Box>
        <Box style={{ ...planColumn.folder, flexDirection: 'column' }}>
          {plan.directory ? <Text style={{ color: palette.ink }}>{plan.directory}</Text> : null}
          {gitLine(plan) ? <Text style={{ color: palette.muted }}>{gitLine(plan)}</Text> : null}
        </Box>
        <Box style={planColumn.files}>
          <Text style={{ color: palette.ink }}>{String(plan.filesModified ?? 0)}</Text>
        </Box>
        <Box style={planColumn.started}>
          <Text style={{ color: palette.ink }}>{formatWhen(plan.startedAt)}</Text>
        </Box>
        <Box style={planColumn.duration}>
          <Text style={{ color: palette.ink }}>{formatDuration(plan.durationMs)}</Text>
        </Box>
        <Box style={planColumn.actions}>
          <PlanActions openUrl={openUrl} archive={archive} onOpen={onOpen} />
        </Box>
      </Box>
      <Box style={{ height: 1, bg: palette.line }} />
    </Box>
  )
}
