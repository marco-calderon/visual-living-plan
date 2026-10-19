import { Box } from '@semos-labs/glyph'
import type { ProcessRecord } from '../processRecord'
import { ProcessCard } from './ProcessCard'

type ProcessListProps = {
  records: ProcessRecord[]
  selectedId: string | null
  onSelect: (id: string) => void
  onOpen: (url: string) => void
}

export function ProcessList({ records, selectedId, onSelect, onOpen }: ProcessListProps) {
  return (
    <Box style={{ flexDirection: 'column', gap: 1 }}>
      {records.map((record) => (
        <ProcessCard
          key={record.id}
          record={record}
          selected={record.id === selectedId}
          onSelect={() => onSelect(record.id)}
          onOpen={onOpen}
        />
      ))}
    </Box>
  )
}
