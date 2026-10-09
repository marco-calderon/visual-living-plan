import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import {
  ExecutionStepNode,
  PlanRefContext,
  type ExecutionStepNodeData,
  type ExecutionStepNodeType,
} from './ExecutionStepNode.tsx'
import { LoopEdge } from './LoopEdge.tsx'

const nodeTypes = {
  executionStep: ExecutionStepNode,
} satisfies NodeTypes

const edgeTypes = {
  loop: LoopEdge,
} satisfies EdgeTypes

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

type EdgeColors = {
  accent: string
  muted: string
  labelBg: string
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
      planRef: node.planRef,
      planLabel: node.planLabel,
    },
    ariaLabel: node.planRef
      ? `${node.label}. Plan reference ${node.planLabel ?? node.planRef}`
      : node.label,
    draggable: false,
    connectable: false,
    selectable: Boolean(node.planRef),
  }))
}

function toFlowEdges(model: ExecutionCanvasProps['model'], colors: EdgeColors): Edge[] {
  return model.edges.map((edge) => {
    const sourceSide = edge.sourceSide ?? 'right'
    const targetSide = edge.targetSide ?? 'left'
    const isLoop = edge.source === edge.target
    const closesLoop = !isLoop && (sourceSide !== 'right' || targetSide !== 'left')
    const emphasized = isLoop || closesLoop
    const stroke = emphasized ? colors.accent : colors.muted

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
      labelStyle: edge.label && !isLoop ? { fill: colors.accent, fontWeight: 700, fontSize: 11 } : undefined,
      labelBgStyle: edge.label && !isLoop ? { fill: colors.labelBg, fillOpacity: 0.96 } : undefined,
      labelBgPadding: edge.label && !isLoop ? [4, 6] : undefined,
      labelBgBorderRadius: edge.label && !isLoop ? 8 : undefined,
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: stroke },
      style: { stroke, strokeWidth: emphasized ? 1.75 : 1.4 },
    }
  })
}

function ReactFlowCanvasInner({ model, readonly = true, onSelectPlanRef }: ExecutionCanvasProps) {
  const { fitView } = useReactFlow()
  const theme = useResolvedTheme()
  const edgeColors = useMemo<EdgeColors>(
    () => ({
      accent: cssVar('--accent', theme === 'dark' ? '#2dd4bf' : '#0f766e'),
      muted: cssVar('--muted', theme === 'dark' ? '#b7c7c0' : '#5b6b63'),
      labelBg: cssVar('--stage-bg', theme === 'dark' ? '#0e1614' : '#f7faf8'),
    }),
    [theme],
  )
  const initialNodes = useMemo(() => toFlowNodes(model), [model])
  const initialEdges = useMemo(() => toFlowEdges(model, edgeColors), [model, edgeColors])
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const canvasColors = useMemo(
    () => ({
      dot: cssVar('--dot', theme === 'dark' ? 'rgba(232, 243, 238, 0.14)' : 'rgba(20, 32, 27, 0.12)'),
      idle: cssVar('--minimap-idle', theme === 'dark' ? '#64748b' : '#94a3b8'),
    }),
    [theme],
  )

  const hostRef = useRef<HTMLDivElement>(null)

  const fit = useCallback(() => {
    const host = hostRef.current
    if (!host || host.clientWidth < 40 || host.clientHeight < 40) return
    void fitView({ padding: 0.28, duration: 220, minZoom: 0.2, maxZoom: 1.15 })
  }, [fitView])

  useEffect(() => {
    setNodes(toFlowNodes(model))
    setEdges(toFlowEdges(model, edgeColors))
    const frame = requestAnimationFrame(() => {
      fit()
    })
    return () => cancelAnimationFrame(frame)
  }, [model, edgeColors, setNodes, setEdges, fit])

  useEffect(() => {
    const host = hostRef.current
    if (!host || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      fit()
    })
    observer.observe(host)
    return () => observer.disconnect()
  }, [fit])

  const openPlanRef = useCallback(
    (planRef: string) => {
      if (!planRef) return
      onSelectPlanRef?.(planRef)
    },
    [onSelectPlanRef],
  )

  return (
    <PlanRefContext.Provider value={openPlanRef}>
    <div ref={hostRef} className="execution-canvas-host">
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={readonly ? undefined : onEdgesChange}
      onNodeClick={(_event, node) => {
        const planRef = (node.data as ExecutionStepNodeData).planRef
        if (planRef) openPlanRef(planRef)
      }}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      nodesDraggable={!readonly}
      nodesConnectable={false}
      elementsSelectable
      panOnDrag
      zoomOnScroll
      minZoom={0.2}
      maxZoom={1.5}
      colorMode={theme}
      fitView
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={18} size={1} color={canvasColors.dot} />
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        style={{ width: 112, height: 74 }}
        maskColor={theme === 'dark' ? 'rgba(8, 14, 12, 0.55)' : 'rgba(247, 250, 248, 0.65)'}
        nodeColor={(node) => {
          const status = (node.data as { status?: string } | undefined)?.status
          if (status === 'done') return theme === 'dark' ? '#4ade80' : '#166534'
          if (status === 'active') return theme === 'dark' ? '#2dd4bf' : '#0f766e'
          if (status === 'failed') return theme === 'dark' ? '#f87171' : '#b42318'
          if (status === 'blocked') return theme === 'dark' ? '#fbbf24' : '#b45309'
          return canvasColors.idle
        }}
      />
    </ReactFlow>
    </div>
    </PlanRefContext.Provider>
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
