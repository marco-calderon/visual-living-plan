import { Button } from '@semos-labs/glyph'
import { usePalette } from './PaletteProvider'

type SegmentButtonProps = {
  label: string
  pressed: boolean
  onPress: () => void
}

export function SegmentButton({ label, pressed, onPress }: SegmentButtonProps) {
  const palette = usePalette()
  return (
    <Button
      label={label}
      onPress={onPress}
      style={{
        border: 'round',
        paddingX: 2,
        borderColor: pressed ? palette.accent : palette.line,
        bg: pressed ? palette.accent : palette.panel,
        color: pressed ? palette.onAccent : palette.ink,
        bold: pressed,
      }}
      focusedStyle={{
        borderColor: palette.accent,
        bg: pressed ? palette.accent : palette.accentSoft,
        color: pressed ? palette.onAccent : palette.accent,
      }}
    />
  )
}
