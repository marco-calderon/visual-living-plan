import { useEffect, useMemo, useState } from 'react'
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { ExecutionCanvasProps } from '../../types.ts'
import { ExecutionStepNode, type ExecutionStepNodeType } from './ExecutionStepNode.tsx'

const nodeTypes = {
  executionStep: ExecutionStepNode,
} satisfies NodeTypes

function useResolvedTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  )

  useEffect(() => {
    const root = document.documentElement
    const sync = () => {
      setTheme(root.dataset.theme === 'dark' ? 'dark' : 'light')
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  return theme
}

function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

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
  return model.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    animated: false,
    type: 'smoothstep',
  }))
}

function ReactFlowCanvasInner({ model, readonly = true }: ExecutionCanvasProps) {
  const { fitView } = useReactFlow()
  const theme = useResolvedTheme()
  const initialNodes = useMemo(() => toFlowNodes(model), [model])
  const initialEdges = useMemo(() => toFlowEdges(model), [model])
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const canvasColors = useMemo(
    () => ({
      dot: cssVar('--dot', theme === 'dark' ? 'rgba(232, 243, 238, 0.14)' : 'rgba(20, 32, 27, 0.12)'),
      idle: cssVar('--minimap-idle', theme === 'dark' ? '#64748b' : '#94a3b8'),
    }),
    [theme],
  )

  useEffect(() => {
    setNodes(toFlowNodes(model))
    setEdges(toFlowEdges(model))
    const frame = requestAnimationFrame(() => {
      void fitView({ padding: 0.2, duration: 220 })
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
      nodesDraggable={!readonly}
      nodesConnectable={!readonly}
      elementsSelectable={!readonly}
      panOnDrag
      zoomOnScroll
      colorMode={theme}
      fitView
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={18} size={1} color={canvasColors.dot} />
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        maskColor={theme === 'dark' ? 'rgba(8, 14, 12, 0.55)' : 'rgba(247, 250, 248, 0.65)'}
        nodeColor={(node) => {
          const status = (node.data as { status?: string } | undefined)?.status
          if (status === 'done') return theme === 'dark' ? '#4ade80' : '#166534'
          if (status === 'active') return theme === 'dark' ? '#2dd4bf' : '#0f766e'
          if (status === 'failed') return theme === 'dark' ? '#f87171' : '#b42318'
          return canvasColors.idle
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
