import { useEffect, useMemo } from 'react'
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
    const isLoop = edge.source === edge.target
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      animated: isLoop,
      type: isLoop ? 'loop' : 'smoothstep',
      data: isLoop ? { label: edge.label } : undefined,
      markerEnd: isLoop
        ? { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#0f766e' }
        : undefined,
      style: isLoop ? { stroke: '#0f766e', strokeWidth: 1.75 } : undefined,
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
  return (
    <div className="execution-canvas">
      <ReactFlowProvider>
        <ReactFlowCanvasInner {...props} />
      </ReactFlowProvider>
    </div>
  )
}
