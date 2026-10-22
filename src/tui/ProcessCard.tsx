import { Box, Text } from '@semos-labs/glyph'
import { useEffect, useRef } from 'react'
import type { TextHandle } from '@semos-labs/glyph'
import type { ProcessRecord } from '../processRecord'
import { usePalette } from './PaletteProvider'
import { PlanActions } from './PlanActions'
import { processLines, processOpenUrl } from './registryView'

type ProcessCardProps = {
  record: ProcessRecord
  selected: boolean
  onSelect: () => void
  onOpen: (url: string) => void
}

export function ProcessCard({ record, selected, onSelect, onOpen }: ProcessCardProps) {
  const palette = usePalette()
  const openUrl = processOpenUrl(record)
  const anchor = useRef<TextHandle>(null)

  useEffect(() => {
    if (selected) anchor.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  return (
    <Box
      onClick={onSelect}
      style={{
        flexDirection: 'column',
        border: 'round',
        borderColor: selected ? palette.accent : palette.line,
        bg: selected ? palette.accentSoft : palette.panel,
        paddingX: 1,
        paddingY: 0,
        gap: 0,
      }}
    >
      <Box style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 1 }}>
        <Text ref={anchor} style={{ bold: true, color: palette.ink }}>
          {selected ? '▸ ' : ''}
          {record.title || 'Untitled plan'}
        </Text>
        <Text style={{ color: palette.muted }}>{(record.mode || 'watch').toUpperCase()}</Text>
      </Box>
      {processLines(record).map((line, index) => (
        <Text key={index} style={{ color: palette.muted }} wrap="ellipsis">
          {line}
        </Text>
      ))}
      <PlanActions openUrl={openUrl} archive={null} onOpen={onOpen} />
    </Box>
  )
}
