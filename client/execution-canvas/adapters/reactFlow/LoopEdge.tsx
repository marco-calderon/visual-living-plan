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
  const rise = 120
  const bulge = 42
  const path = `M ${sourceX} ${sourceY} C ${sourceX + bulge} ${sourceY - rise}, ${targetX - bulge} ${targetY - rise}, ${targetX} ${targetY}`
  const labelX = (sourceX + targetX) / 2
  const labelY = Math.min(sourceY, targetY) - rise * 0.75

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
