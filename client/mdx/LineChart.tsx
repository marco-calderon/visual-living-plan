import { useMemo, type ReactNode } from 'react'
import { defineChart, lineY } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/react'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { scalePoint } from '@tanstack/charts/scales/point'
import { parseChartRows, type ChartRow } from './chartRows.ts'
import { collectText } from './textChildren.ts'

type LineChartProps = {
  ariaLabel: string
  title?: string
  rows?: readonly ChartRow[]
  height?: number
  children?: ReactNode
}

export function LineChart({ ariaLabel, title, rows, height = 280, children }: LineChartProps) {
  const source = collectText(children)
  const definition = useMemo(() => {
    const data = rows && rows.length > 0 ? [...rows] : parseChartRows(source)
    return defineChart({
      marks: [
        lineY(data, {
          x: 'label',
          y: 'value',
          stroke: 'var(--accent)',
        }),
      ],
      scales: {
        x: {
          scale: () => scalePoint<string>().padding(0.4),
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
