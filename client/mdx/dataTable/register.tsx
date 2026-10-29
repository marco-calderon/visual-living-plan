import { Checkbox } from '../../ui/checkbox.tsx'
import { Cell } from './Cell.tsx'
import { Chip } from './Chip.tsx'
import { Column } from './Column.tsx'
import { DataTable } from './DataTable.tsx'
import { Pill } from './Pill.tsx'
import { Row } from './Row.tsx'
import './dataTable.css'

/** Loaded only when the plan source contains `<DataTable>`. */
export const dataTableComponents = {
  DataTable,
  Column,
  Row,
  Cell,
  Chip,
  Pill,
  Checkbox,
}
