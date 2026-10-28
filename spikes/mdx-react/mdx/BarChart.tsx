import { useMemo, type ReactNode } from 'react'
import { barY, defineChart } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/react'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { parseChartRows, type ChartRow } from './chartRows.ts'
import { collectText } from './textChildren.ts'

type BarChartProps = {
  ariaLabel: string
  title?: string
  rows?: readonly ChartRow[]
  height?: number
  children?: ReactNode
}

export function BarChart({ ariaLabel, title, rows, height = 280, children }: BarChartProps) {
  const source = collectText(children)
  const definition = useMemo(() => {
    const data = rows && rows.length > 0 ? [...rows] : parseChartRows(source)
    return defineChart({
      marks: [
        barY(data, {
          x: 'label',
          y: 'value',
          fill: 'var(--accent)',
        }),
      ],
      scales: {
        x: {
          scale: () => scaleBand<string>().padding(0.18),
        },
        y: {
          scale: scaleLinear,
          nice: true,
          grid: true,
          ...(title ? { axis: { label: title } } : {}),
        },
      },
    })
  }, [rows, source, title])

  return (
    <figure className="vlp-chart" aria-label={ariaLabel}>
      {title ? <figcaption>{title}</figcaption> : null}
      <Chart definition={definition} ariaLabel={ariaLabel} height={height} initialWidth={720} />
    </figure>
  )
}
