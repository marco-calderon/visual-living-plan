import { Box, Button } from '@semos-labs/glyph'
import { usePalette } from './PaletteProvider'

type PlanActionsProps = {
  openUrl: string | null
  archive: string | null
  onOpen: (url: string) => void
}

export function PlanActions({ openUrl, archive, onOpen }: PlanActionsProps) {
  const palette = usePalette()
  if (!openUrl && !archive) return null
  return (
    <Box style={{ flexDirection: 'row', gap: 1 }}>
      {openUrl ? (
        <Button
          label="Open"
          onPress={() => onOpen(openUrl)}
          style={{ color: palette.accent, bold: true, paddingX: 1 }}
          focusedStyle={{ bg: palette.accent, color: palette.onAccent }}
        />
      ) : null}
      {archive ? (
        <Button
          label="Plan file"
          onPress={() => onOpen(archive)}
          style={{ color: palette.accent, bold: true, paddingX: 1 }}
          focusedStyle={{ bg: palette.accent, color: palette.onAccent }}
        />
      ) : null}
    </Box>
  )
}
