import { BaseEdge, EdgeLabelRenderer, type Edge, type EdgeProps } from '@xyflow/react'

export type LoopEdgeData = {
  label?: string
}

export type LoopEdgeType = Edge<LoopEdgeData, 'loop'>

type LoopEdgeProps = EdgeProps<LoopEdgeType>

/**
 * Built-in React Flow paths collapse when a node connects to itself.
 * This arc leaves the right handle, clears the top of the node, and
 * returns to the left handle.
 */
export function LoopEdge({ sourceX, sourceY, targetX, targetY, markerEnd, style, data }: LoopEdgeProps) {
  const lift = 96
  const out = 36
  const topY = Math.min(sourceY, targetY) - lift
  const labelX = (sourceX + targetX) / 2
  const labelY = topY
  const path = [
    `M ${sourceX} ${sourceY}`,
    `C ${sourceX + out} ${sourceY}, ${sourceX + out} ${topY}, ${labelX} ${topY}`,
    `C ${targetX - out} ${topY}, ${targetX - out} ${targetY}, ${targetX} ${targetY}`,
  ].join(' ')

  return (
    <>
      <BaseEdge path={path} markerEnd={markerEnd} style={style} />
      {data?.label ? (
        <EdgeLabelRenderer>
          <div
            className="rf-loop-label nodrag nopan"
            style={{
              transform: `translate(-50%, -100%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}
