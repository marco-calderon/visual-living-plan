import { Box, Text } from '@semos-labs/glyph'
import { palette } from './palette.js'

type StatCardProps = {
  label: string
  value: string
}

export function StatCard({ label, value }: StatCardProps) {
  return (
    <Box
      style={{
        border: 'round',
        borderColor: palette.line,
        bg: palette.panel,
        paddingX: 1,
        paddingY: 0,
        flexGrow: 1,
        flexBasis: 16,
        minWidth: 16,
        flexDirection: 'column',
      }}
    >
      <Text style={{ color: palette.muted }}>{label.toUpperCase()}</Text>
      <Text style={{ bold: true, color: palette.ink }}>{value}</Text>
    </Box>
  )
}
