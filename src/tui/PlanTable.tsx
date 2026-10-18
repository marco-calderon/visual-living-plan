import { Box, Text } from '@semos-labs/glyph'
import type { PlanRecord } from '../processRecord'
import { palette } from './palette'
import { planColumn } from './planColumns'
import { PlanRow } from './PlanRow'

type PlanTableProps = {
  plans: PlanRecord[]
  selectedId: string | null
  hoveredId: string | null
  openUrlFor: (plan: PlanRecord) => string | null
  archiveFor: (plan: PlanRecord) => string | null
  onSelect: (id: string) => void
  onHover: (id: string) => void
  onOpen: (url: string) => void
}

const headers = [
  ['PLAN', planColumn.plan],
  ['STATUS', planColumn.status],
  ['COMPLETION', planColumn.completion],
  ['FOLDER', planColumn.folder],
  ['FILES', planColumn.files],
  ['STARTED', planColumn.started],
  ['DURATION', planColumn.duration],
  ['', planColumn.actions],
] as const

export function PlanTable({
  plans,
  selectedId,
  hoveredId,
  openUrlFor,
  archiveFor,
  onSelect,
  onHover,
  onOpen,
}: PlanTableProps) {
  return (
    <Box style={{ flexDirection: 'column', width: '100%' }}>
      <Box style={{ flexDirection: 'row', gap: 1, paddingY: 0 }}>
        {headers.map(([label, column]) => (
          <Box key={label || 'actions'} style={column}>
            <Text style={{ color: palette.muted, bold: true }}>{label}</Text>
          </Box>
        ))}
      </Box>
      <Box style={{ height: 1, bg: palette.line }} />
      {plans.map((plan) => (
        <PlanRow
          key={plan.id}
          plan={plan}
          selected={plan.id === selectedId}
          hovered={plan.id === hoveredId}
          openUrl={openUrlFor(plan)}
          archive={archiveFor(plan)}
          onSelect={() => onSelect(plan.id)}
          onHover={() => onHover(plan.id)}
          onOpen={onOpen}
        />
      ))}
    </Box>
  )
}
