import { Box, Text } from '@semos-labs/glyph'
import type { PlanRecord } from '../processRecord'
import { planRowKey, uniqueRowKeys } from './dashboardView'
import { usePalette } from './PaletteProvider'
import { planColumn } from './planColumns'
import { PlanRow } from './PlanRow'

type PlanTableProps = {
  plans: PlanRecord[]
  selectedKey: string | null
  hoveredKey: string | null
  openUrlFor: (plan: PlanRecord) => string | null
  archiveFor: (plan: PlanRecord) => string | null
  onSelect: (key: string) => void
  onHover: (key: string) => void
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
  selectedKey,
  hoveredKey,
  openUrlFor,
  archiveFor,
  onSelect,
  onHover,
  onOpen,
}: PlanTableProps) {
  const palette = usePalette()
  const rowKeys = uniqueRowKeys(plans, planRowKey)
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
      {plans.map((plan, index) => {
        const key = rowKeys[index] ?? planRowKey(plan)
        return (
          <PlanRow
            key={key}
            plan={plan}
            selected={key === selectedKey}
            hovered={key === hoveredKey}
            openUrl={openUrlFor(plan)}
            archive={archiveFor(plan)}
            onSelect={() => onSelect(key)}
            onHover={() => onHover(key)}
            onOpen={onOpen}
          />
        )
      })}
    </Box>
  )
}
