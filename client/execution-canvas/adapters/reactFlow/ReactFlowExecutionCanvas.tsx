import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type EdgeTypes,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { ExecutionCanvasProps } from '../../types.ts'
import { ExecutionStepNode, type ExecutionStepNodeType } from './ExecutionStepNode.tsx'
import { LoopEdge } from './LoopEdge.tsx'

const nodeTypes = {
  executionStep: ExecutionStepNode,
} satisfies NodeTypes

const edgeTypes = {
  loop: LoopEdge,
} satisfies EdgeTypes

function toFlowNodes(model: ExecutionCanvasProps['model']): ExecutionStepNodeType[] {
  return model.nodes.map((node) => ({
    id: node.id,
    type: 'executionStep',
    position: node.position,
    data: {
      label: node.label,
      detail: node.detail,
      status: node.status,
    },
    draggable: false,
    connectable: false,
    selectable: false,
  }))
}

function toFlowEdges(model: ExecutionCanvasProps['model']): Edge[] {
  return model.edges.map((edge) => {
    const sourceSide = edge.sourceSide ?? 'right'
    const targetSide = edge.targetSide ?? 'left'
    const isLoop = edge.source === edge.target
    const closesLoop = !isLoop && (sourceSide !== 'right' || targetSide !== 'left')
    const emphasized = isLoop || closesLoop
    const stroke = emphasized ? '#0f766e' : '#5b6b63'

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: `out-${sourceSide}`,
      targetHandle: `in-${targetSide}`,
      animated: emphasized,
      type: isLoop ? 'loop' : 'smoothstep',
      data: isLoop ? { label: edge.label } : undefined,
      label: isLoop ? undefined : edge.label,
      labelStyle: edge.label && !isLoop ? { fill: '#0f766e', fontWeight: 700, fontSize: 11 } : undefined,
      labelBgStyle: edge.label && !isLoop ? { fill: '#f7faf8', fillOpacity: 0.96 } : undefined,
      labelBgPadding: edge.label && !isLoop ? [4, 6] : undefined,
      labelBgBorderRadius: edge.label && !isLoop ? 8 : undefined,
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: stroke },
      style: { stroke, strokeWidth: emphasized ? 1.75 : 1.4 },
    }
  })
}

function ReactFlowCanvasInner({ model, readonly = true }: ExecutionCanvasProps) {
  const { fitView } = useReactFlow()
  const initialNodes = useMemo(() => toFlowNodes(model), [model])
  const initialEdges = useMemo(() => toFlowEdges(model), [model])
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  useEffect(() => {
    setNodes(toFlowNodes(model))
    setEdges(toFlowEdges(model))
    const frame = requestAnimationFrame(() => {
      void fitView({ padding: 0.28, duration: 220 })
    })
    return () => cancelAnimationFrame(frame)
  }, [model, setNodes, setEdges, fitView])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={readonly ? undefined : onNodesChange}
      onEdgesChange={readonly ? undefined : onEdgesChange}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      nodesDraggable={!readonly}
      nodesConnectable={!readonly}
      elementsSelectable={!readonly}
      panOnDrag
      zoomOnScroll
      fitView
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={18} size={1} color="rgba(20, 32, 27, 0.12)" />
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        nodeColor={(node) => {
          const status = (node.data as { status?: string } | undefined)?.status
          if (status === 'done') return '#166534'
          if (status === 'active') return '#0f766e'
          if (status === 'failed') return '#b42318'
          return '#94a3b8'
        }}
      />
    </ReactFlow>
  )
}

export function ReactFlowExecutionCanvas(props: ExecutionCanvasProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return

    const update = () => {
      setVisible(frame.clientWidth > 0 && frame.clientHeight > 0)
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="execution-canvas" ref={frameRef}>
      {visible ? (
        <ReactFlowProvider>
          <ReactFlowCanvasInner {...props} />
        </ReactFlowProvider>
      ) : null}
    </div>
  )
}
