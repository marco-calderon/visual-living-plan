import { Box } from '@semos-labs/glyph'
import type { ProcessRecord } from '../processRecord'
import { uniqueRowKeys } from './dashboardView'
import { ProcessCard } from './ProcessCard'
import { processRowKey } from './registryView'

type ProcessListProps = {
  records: ProcessRecord[]
  selectedKey: string | null
  onSelect: (key: string) => void
  onOpen: (url: string) => void
}

export function ProcessList({ records, selectedKey, onSelect, onOpen }: ProcessListProps) {
  const rowKeys = uniqueRowKeys(records, processRowKey)
  return (
    <Box style={{ flexDirection: 'column', gap: 1 }}>
      {records.map((record, index) => {
        const key = rowKeys[index] ?? processRowKey(record)
        return (
          <ProcessCard
            key={key}
            record={record}
            selected={key === selectedKey}
            onSelect={() => onSelect(key)}
            onOpen={onOpen}
          />
        )
      })}
    </Box>
  )
}
