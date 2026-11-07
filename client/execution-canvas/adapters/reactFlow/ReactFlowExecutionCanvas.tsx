import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
  type Viewport,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { ExecutionCanvasProps } from '../../types.ts'
import { layoutWorkflowNodes } from '../../../layoutWorkflow.ts'
import { stepNeedsFrame } from '../../stepNeedsFrame.ts'
import {
  ExecutionStepNode,
  PlanRefContext,
  type ExecutionStepNodeData,
  type ExecutionStepNodeType,
} from './ExecutionStepNode.tsx'
import { LoopEdge } from './LoopEdge.tsx'
import { RoutedEdge } from './RoutedEdge.tsx'

const nodeTypes = {
  executionStep: ExecutionStepNode,
} satisfies NodeTypes

const edgeTypes = {
  loop: LoopEdge,
  routed: RoutedEdge,
} satisfies EdgeTypes

function useResolvedTheme(): { mode: 'light' | 'dark'; accent: string } {
  const [state, setState] = useState(() => ({
    mode: (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light') as 'light' | 'dark',
    accent: document.documentElement.dataset.accent ?? '',
  }))

  useEffect(() => {
    const root = document.documentElement
    const sync = () => {
      setState({
        mode: root.dataset.theme === 'dark' ? 'dark' : 'light',
        accent: root.dataset.accent ?? '',
      })
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-accent'] })
    window.addEventListener('living-plan-theme', sync)
    return () => {
      observer.disconnect()
      window.removeEventListener('living-plan-theme', sync)
    }
  }, [])

  return state
}

function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

type EdgeColors = {
  accent: string
  muted: string
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

function placeMeasuredNodes(nodes: ExecutionStepNodeType[], edges: Edge[]): ExecutionStepNodeType[] {
  const sizes = new Map<string, { width: number; height: number }>()
  for (const node of nodes) {
    const width = node.measured?.width ?? 0
    const height = node.measured?.height ?? 0
    if (width > 0 && height > 0) sizes.set(node.id, { width, height })
  }
  if (sizes.size !== nodes.length) return nodes

  const laidOut = layoutWorkflowNodes(
    nodes.map((node) => ({
      id: node.id,
      label: node.data.label,
      detail: node.data.detail,
      planRef: node.data.planRef,
      planLabel: node.data.planLabel,
    })),
    edges.map((edge) => ({ from: edge.source, to: edge.target })),
    sizes,
  )
  const positionById = new Map(laidOut.map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }]))
  return nodes.map((node) => {
    const position = positionById.get(node.id)
    if (!position) return node
    if (Math.abs(node.position.x - position.x) <= 0.5 && Math.abs(node.position.y - position.y) <= 0.5) {
      return node
    }
    return { ...node, position }
  })
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
      type: isLoop ? 'loop' : 'routed',
      data: { label: edge.label },
      label: isLoop ? undefined : edge.label,
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: stroke },
      style: { stroke, strokeWidth: emphasized ? 1.75 : 1.4 },
    }
  })
}

type WorkflowFocusWindow = Window & {
  livingPlanPendingWorkflowFocus?: string | null
  livingPlanWorkflowFocusMissed?: () => void
}

/**
 * The view the person chose by zooming or panning. It outlives the canvas, which unmounts while the
 * Workflow tab is hidden, so coming back to the tab keeps their zoom.
 */
let chosenViewport: Viewport | null = null

/** The steps and their links. A status or label change keeps the shape, and keeps the view. */
function shapeKey(model: ExecutionCanvasProps['model']): string {
  return `${model.nodes.map((node) => node.id).join(',')}|${model.edges.map((edge) => `${edge.source}>${edge.target}`).join(',')}`
}

function pendingWorkflowFocus(): string | null {
  const ref = (window as WorkflowFocusWindow).livingPlanPendingWorkflowFocus
  return ref ? ref : null
}

function ReactFlowCanvasInner({ model, readonly = true, onSelectPlanRef }: ExecutionCanvasProps) {
  const { fitView, flowToScreenPosition, getViewport, setCenter } = useReactFlow()
  const theme = useResolvedTheme()
  const edgeColors = useMemo<EdgeColors>(
    () => ({
      accent: cssVar('--accent', theme.mode === 'dark' ? '#2dd4bf' : '#0f766e'),
      muted: cssVar('--muted', theme.mode === 'dark' ? '#b7c7c0' : '#5b6b63'),
    }),
    [theme],
  )
  const initialNodes = useMemo(() => toFlowNodes(model), [model])
  const initialEdges = useMemo(() => toFlowEdges(model, edgeColors), [model, edgeColors])
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const measureKey = nodes
    .map((node) => `${node.id}:${Math.round(node.measured?.width ?? 0)}x${Math.round(node.measured?.height ?? 0)}`)
    .join('|')
  const edgeKey = edges.map((edge) => `${edge.source}>${edge.target}`).join('|')
  const canvasColors = useMemo(
    () => ({
      dot: cssVar('--dot', theme.mode === 'dark' ? 'rgba(232, 243, 238, 0.14)' : 'rgba(20, 32, 27, 0.12)'),
      idle: cssVar('--minimap-idle', theme.mode === 'dark' ? '#64748b' : '#94a3b8'),
      mask: cssVar(
        '--minimap-mask',
        theme.mode === 'dark' ? 'rgba(8, 14, 12, 0.55)' : 'rgba(247, 250, 248, 0.65)',
      ),
    }),
    [theme],
  )

  const hostRef = useRef<HTMLDivElement>(null)
  const placedKey = useRef('')
  const shapeRef = useRef<string | null>(null)
  // Once the person zooms or pans, updates stop fitting the whole graph. Fit view hands control back.
  const userMoved = useRef(chosenViewport !== null)
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes

  const focusStep = useCallback(
    (ref: string): boolean => {
      const host = hostRef.current
      const node = nodesRef.current.find((item) => item.data.planRef === ref || item.id === ref)
      if (!host || !node) return false
      const width = node.measured?.width ?? 0
      const height = node.measured?.height ?? 0
      if (width <= 0 || height <= 0) return false

      setNodes((existing) => {
        let changed = false
        const next = existing.map((item) => {
          const match = item.id === node.id
          const className = match ? 'workflow-focus' : undefined
          if (Boolean(item.selected) === match && item.className === className) return item
          changed = true
          return { ...item, selected: match, className }
        })
        return changed ? next : existing
      })

      const topLeft = flowToScreenPosition(node.position)
      const bottomRight = flowToScreenPosition({
        x: node.position.x + width,
        y: node.position.y + height,
      })
      const bounds = host.getBoundingClientRect()
      if (
        stepNeedsFrame({
          top: topLeft.y,
          left: topLeft.x,
          right: bottomRight.x,
          bottom: bottomRight.y,
          width,
          zoom: getViewport().zoom,
          bounds: { top: bounds.top, left: bounds.left, right: bounds.right, bottom: bounds.bottom },
        })
      ) {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        void fitView({
          nodes: [{ id: node.id }],
          padding: 0.42,
          duration: reduce ? 0 : 200,
          minZoom: 0.2,
          maxZoom: 1.15,
        })
      }
      return true
    },
    [fitView, flowToScreenPosition, getViewport, setNodes],
  )

  const fit = useCallback(() => {
    const host = hostRef.current
    if (!host || host.clientWidth < 40 || host.clientHeight < 40) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const pending = pendingWorkflowFocus()
    if (pending) {
      if (focusStep(pending)) return
      const current = nodesRef.current
      const measured = current.length > 0 && current.every((node) => (node.measured?.width ?? 0) > 0)
      if (!measured) return
      const known = current.some((node) => node.data.planRef === pending || node.id === pending)
      if (!known) {
        ;(window as WorkflowFocusWindow).livingPlanPendingWorkflowFocus = null
        ;(window as WorkflowFocusWindow).livingPlanWorkflowFocusMissed?.()
      }
      return
    }
    if (userMoved.current) return
    void fitView({ padding: 0.28, duration: reduce ? 0 : 200, minZoom: 0.2, maxZoom: 1.15 })
  }, [fitView, focusStep])

  useEffect(() => {
    const shape = shapeKey(model)
    const fresh = toFlowNodes(model)
    setEdges(toFlowEdges(model, edgeColors))
    if (shapeRef.current === shape) {
      // Same steps: update status and text in place. Positions, sizes, and the view stay.
      const byId = new Map(fresh.map((node) => [node.id, node]))
      setNodes((existing) =>
        existing.map((item) => {
          const next = byId.get(item.id)
          return next ? { ...item, data: next.data, ariaLabel: next.ariaLabel, selectable: next.selectable } : item
        }),
      )
      return
    }
    shapeRef.current = shape
    placedKey.current = ''
    setNodes(fresh)
    const frame = requestAnimationFrame(() => {
      fit()
    })
    return () => cancelAnimationFrame(frame)
  }, [model, edgeColors, setNodes, setEdges, fit])

  // Follow the running step: when it changes and sits outside the view, pan to it at the current zoom.
  const activeId = model.nodes.find((node) => node.status === 'active')?.id ?? null
  const followed = useRef<string | null>(chosenViewport ? null : activeId)
  useEffect(() => {
    if (!activeId || followed.current === activeId || pendingWorkflowFocus()) return
    const host = hostRef.current
    const node = nodesRef.current.find((item) => item.id === activeId)
    const width = node?.measured?.width ?? 0
    const height = node?.measured?.height ?? 0
    if (!host || !node || width <= 0 || height <= 0) return
    followed.current = activeId
    const topLeft = flowToScreenPosition(node.position)
    const bottomRight = flowToScreenPosition({ x: node.position.x + width, y: node.position.y + height })
    const bounds = host.getBoundingClientRect()
    const marginX = bounds.width * 0.08
    const marginY = bounds.height * 0.08
    const inView =
      topLeft.x >= bounds.left + marginX &&
      bottomRight.x <= bounds.right - marginX &&
      topLeft.y >= bounds.top + marginY &&
      bottomRight.y <= bounds.bottom - marginY
    if (inView) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    void setCenter(node.position.x + width / 2, node.position.y + height / 2, {
      zoom: getViewport().zoom,
      duration: reduce ? 0 : 300,
    })
  }, [activeId, measureKey, flowToScreenPosition, getViewport, setCenter])

  // Card height follows the label, so the first positions are an estimate.
  // Once React Flow measures the cards, ELK runs again and the edge router
  // uses those real boxes.
  useLayoutEffect(() => {
    if (nodes.length === 0 || nodes.some((node) => (node.measured?.width ?? 0) <= 0 || (node.measured?.height ?? 0) <= 0)) {
      return
    }
    const key = `${measureKey}|${edgeKey}`
    if (placedKey.current === key) return
    placedKey.current = key
    const next = placeMeasuredNodes(nodes, edges)
    if (next.every((node, index) => node === nodes[index])) return
    setNodes(next)
    requestAnimationFrame(() => {
      fit()
    })
  }, [measureKey, edgeKey, nodes, edges, setNodes, fit])

  useEffect(() => {
    const onFocus = () => {
      requestAnimationFrame(() => fit())
    }
    window.addEventListener('living-plan-focus-workflow', onFocus)
    return () => window.removeEventListener('living-plan-focus-workflow', onFocus)
  }, [fit])

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
      colorMode={theme.mode}
      fitView={chosenViewport === null}
      defaultViewport={chosenViewport ?? undefined}
      onMoveStart={(event) => {
        // A gesture carries an event. Fitting and following do not.
        if (event) userMoved.current = true
      }}
      onMoveEnd={(_event, viewport) => {
        if (userMoved.current) chosenViewport = viewport
      }}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={18} size={1} color={canvasColors.dot} />
      <Controls
        showInteractive={false}
        onZoomIn={() => {
          userMoved.current = true
        }}
        onZoomOut={() => {
          userMoved.current = true
        }}
        onFitView={() => {
          userMoved.current = false
          chosenViewport = null
        }}
      />
      <MiniMap
        pannable
        zoomable
        style={{ width: 112, height: 74 }}
        maskColor={canvasColors.mask}
        nodeColor={(node) => {
          const status = (node.data as { status?: string } | undefined)?.status
          if (status === 'done') return theme.mode === 'dark' ? '#4ade80' : '#166534'
          if (status === 'active') return edgeColors.accent
          if (status === 'failed') return theme.mode === 'dark' ? '#f87171' : '#b42318'
          if (status === 'blocked') return theme.mode === 'dark' ? '#fbbf24' : '#b45309'
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
