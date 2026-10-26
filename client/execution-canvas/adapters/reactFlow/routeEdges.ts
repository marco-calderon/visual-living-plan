export type Point = { x: number; y: number }

export type PortSide = 'top' | 'right' | 'bottom' | 'left'

export type RoutedNode = {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export type RoutedEdgeInput = {
  id: string
  source: string
  target: string
  sourceSide: PortSide
  targetSide: PortSide
  sourcePoint: Point
  targetPoint: Point
}

export type WorkflowRoute = {
  id: string
  points: Point[]
  path: string
  labelX: number
  labelY: number
}

const DIR: Record<PortSide, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
}

const CORNER_RADIUS = 6
const CHANNEL_PAD = 12
const RAIL_GAP = 18

/**
 * Default smooth-step offset is 20px on each side. Wrapped plan steps leave a
 * gutter narrower than that, so the path travels past the next handle and folds
 * back over itself. Fit the offset to the gutter, and give each backward edge
 * its own outer rail so row-wraps do not share one line.
 */
export function routeWorkflowEdges(nodes: RoutedNode[], edges: RoutedEdgeInput[]): WorkflowRoute[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const present = edges.filter((edge) => {
    if (edge.source === edge.target) return false
    if (nodes.length === 0) return true
    return nodeById.has(edge.source) && nodeById.has(edge.target)
  })

  const railLane = new Map<string, number>()
  const byExit = new Map<PortSide, RoutedEdgeInput[]>()
  for (const edge of present) {
    if (!isBackward(edge)) continue
    const list = byExit.get(edge.sourceSide) ?? []
    list.push(edge)
    byExit.set(edge.sourceSide, list)
  }
  for (const list of byExit.values()) {
    const sorted = list.slice().sort(compareAlongSide)
    sorted.forEach((edge, index) => {
      railLane.set(edge.id, index)
    })
  }

  const forwardLane = new Map<string, number>()
  const forward = present.filter((edge) => !isBackward(edge))
  for (const group of clusterSpines(forward.map(forwardSpine))) {
    if (group.length < 2) continue
    const sorted = group.slice().sort((a, b) => a.id.localeCompare(b.id))
    sorted.forEach((spine, index) => {
      forwardLane.set(spine.id, index - (sorted.length - 1) / 2)
    })
  }

  const reservedY: number[] = []
  const reservedX: number[] = []
  const ordered = present
    .slice()
    .sort((a, b) => a.sourcePoint.y - b.sourcePoint.y || a.id.localeCompare(b.id))
  const byId = new Map<string, WorkflowRoute>()

  for (const edge of ordered) {
    const lane = forwardLane.get(edge.id) ?? 0
    const local = isBackward(edge) ? null : isMixed(edge) ? routeMixed(edge, lane) : routeForward(edge, lane)
    const points =
      local && !middleIntersects(local, nodes)
        ? local
        : routeOuter(edge, railLane.get(edge.id) ?? Math.abs(Math.round(lane)), nodes, reservedY, reservedX)
    const clean = dedupe(points)
    const label = labelPoint(clean)
    byId.set(edge.id, {
      id: edge.id,
      points: clean,
      path: smoothPath(clean),
      labelX: label.x,
      labelY: label.y,
    })
  }

  return present.map((edge) => {
    const route = byId.get(edge.id)
    if (!route) {
      return { id: edge.id, points: [], path: '', labelX: 0, labelY: 0 }
    }
    return route
  })
}

export function sideFromHandle(handle: string | null | undefined, fallback: PortSide): PortSide {
  const side = handle?.split('-')[1]
  if (side === 'top' || side === 'right' || side === 'bottom' || side === 'left') return side
  return fallback
}

export function portPoint(node: RoutedNode, side: PortSide, role: 'source' | 'target'): Point {
  const ratio = anchorRatio(side, role)
  switch (side) {
    case 'left':
      return { x: node.x, y: node.y + node.height * ratio }
    case 'right':
      return { x: node.x + node.width, y: node.y + node.height * ratio }
    case 'top':
      return { x: node.x + node.width * ratio, y: node.y }
    case 'bottom':
      return { x: node.x + node.width * ratio, y: node.y + node.height }
  }
}

function anchorRatio(side: PortSide, role: 'source' | 'target'): number {
  if (side === 'top' && role === 'source') return 0.78
  if (side === 'bottom' && role === 'source') return 0.22
  if (side === 'bottom' && role === 'target') return 0.78
  if (side === 'left' && role === 'source') return 0.78
  if (side === 'right' && role === 'target') return 0.78
  return 0.5
}

function travel(edge: RoutedEdgeInput): number {
  const dir = DIR[edge.sourceSide]
  return (
    (edge.targetPoint.x - edge.sourcePoint.x) * dir.x + (edge.targetPoint.y - edge.sourcePoint.y) * dir.y
  )
}

function isBackward(edge: RoutedEdgeInput): boolean {
  return travel(edge) < -4
}

function isMixed(edge: RoutedEdgeInput): boolean {
  const sourceHorizontal = edge.sourceSide === 'left' || edge.sourceSide === 'right'
  const targetHorizontal = edge.targetSide === 'left' || edge.targetSide === 'right'
  return sourceHorizontal !== targetHorizontal
}

function compareAlongSide(a: RoutedEdgeInput, b: RoutedEdgeInput): number {
  const horizontal = a.sourceSide === 'left' || a.sourceSide === 'right'
  const delta = horizontal ? a.sourcePoint.y - b.sourcePoint.y : a.sourcePoint.x - b.sourcePoint.x
  if (delta !== 0) return delta
  return a.id.localeCompare(b.id)
}

function fittedOffset(gap: number): number {
  const room = gap / 2 - 2
  if (!(room > 1)) return Math.max(gap / 2 - 0.5, 0)
  return Math.min(20, room)
}

function routeForward(edge: RoutedEdgeInput, lane: number): Point[] {
  const horizontal = edge.sourceSide === 'left' || edge.sourceSide === 'right'
  const source = edge.sourcePoint
  const target = edge.targetPoint
  const aligned = horizontal
    ? Math.abs(source.y - target.y) <= 8
    : Math.abs(source.x - target.x) <= 8
  const gap = travel(edge)
  const misalign = horizontal ? Math.abs(source.y - target.y) : Math.abs(source.x - target.x)
  // Smooth-step corners need a wide gutter. Between wrapped steps the gap is
  // only a few dozen pixels, and a step there folds into a hook.
  if (Math.abs(lane) <= 0.01 && gap < 56 && misalign > 1) {
    return [source, target]
  }

  const offset = fittedOffset(gap)
  const sourceDir = DIR[edge.sourceSide]
  const sourceGap = {
    x: source.x + sourceDir.x * offset,
    y: source.y + sourceDir.y * offset,
  }
  const targetGap = targetStub(edge, offset)

  if (aligned && Math.abs(lane) > 0.01) {
    return bow(source, target, sourceGap, targetGap, lane, horizontal)
  }
  if (aligned && horizontal && Math.abs(source.y - target.y) <= 1) return [source, target]
  if (aligned && !horizontal && Math.abs(source.x - target.x) <= 1) return [source, target]

  if (horizontal) {
    const low = Math.min(sourceGap.x, targetGap.x)
    const high = Math.max(sourceGap.x, targetGap.x)
    const midX = clamp((sourceGap.x + targetGap.x) / 2 + lane * 14, low, high)
    return [source, sourceGap, { x: midX, y: source.y }, { x: midX, y: target.y }, targetGap, target]
  }

  const low = Math.min(sourceGap.y, targetGap.y)
  const high = Math.max(sourceGap.y, targetGap.y)
  const midY = clamp((sourceGap.y + targetGap.y) / 2 + lane * 14, low, high)
  return [source, sourceGap, { x: source.x, y: midY }, { x: target.x, y: midY }, targetGap, target]
}

function targetStub(edge: RoutedEdgeInput, offset: number): Point {
  const target = edge.targetPoint
  const dir = DIR[edge.targetSide]
  const stub = { x: target.x + dir.x * offset, y: target.y + dir.y * offset }
  const source = edge.sourcePoint
  const stubCloser =
    Math.hypot(stub.x - source.x, stub.y - source.y) <= Math.hypot(target.x - source.x, target.y - source.y) + 0.5
  return stubCloser ? stub : target
}

function bow(
  source: Point,
  target: Point,
  sourceGap: Point,
  targetGap: Point,
  lane: number,
  horizontal: boolean,
): Point[] {
  const shift = lane * 16
  if (horizontal) {
    const y = source.y + shift
    return [source, sourceGap, { x: sourceGap.x, y }, { x: targetGap.x, y }, targetGap, target]
  }
  const x = source.x + shift
  return [source, sourceGap, { x, y: sourceGap.y }, { x, y: targetGap.y }, targetGap, target]
}

function routeMixed(edge: RoutedEdgeInput, lane: number): Point[] {
  const source = edge.sourcePoint
  const target = edge.targetPoint
  const sourceDir = DIR[edge.sourceSide]
  const targetDir = DIR[edge.targetSide]
  const offset = 18
  const departed = {
    x: source.x + sourceDir.x * offset,
    y: source.y + sourceDir.y * offset,
  }
  const arrived = {
    x: target.x + targetDir.x * offset,
    y: target.y + targetDir.y * offset,
  }
  const shift = lane * 14
  const corner =
    sourceDir.x !== 0
      ? { x: departed.x, y: arrived.y + shift }
      : { x: arrived.x + shift, y: departed.y }
  return [source, departed, corner, arrived, target]
}

function routeOuter(
  edge: RoutedEdgeInput,
  railLane: number,
  nodes: RoutedNode[],
  reservedY: number[],
  reservedX: number[],
): Point[] {
  const source = edge.sourcePoint
  const target = edge.targetPoint
  const sourceHorizontal = edge.sourceSide === 'left' || edge.sourceSide === 'right'
  const targetHorizontal = edge.targetSide === 'left' || edge.targetSide === 'right'

  if (sourceHorizontal && targetHorizontal) {
    const exitSide = edge.sourceSide === 'left' ? 'left' : 'right'
    const entrySide = edge.targetSide === 'left' ? 'left' : 'right'
    const exitX = outerX(exitSide, nodes, railLane, source.x)
    const entryX = outerX(entrySide, nodes, railLane, target.x)
    const y = clearChannel((source.y + target.y) / 2, (value) => horizontalHits(value, exitX, entryX, nodes), reservedY)
    reservedY.push(y)
    return [
      source,
      { x: exitX, y: source.y },
      { x: exitX, y },
      { x: entryX, y },
      { x: entryX, y: target.y },
      target,
    ]
  }

  if (!sourceHorizontal && !targetHorizontal) {
    const exitSide = edge.sourceSide === 'top' ? 'top' : 'bottom'
    const entrySide = edge.targetSide === 'top' ? 'top' : 'bottom'
    const exitY = outerY(exitSide, nodes, railLane, source.y)
    const entryY = outerY(entrySide, nodes, railLane, target.y)
    const x = clearChannel((source.x + target.x) / 2, (value) => verticalHits(value, exitY, entryY, nodes), reservedX)
    reservedX.push(x)
    return [
      source,
      { x: source.x, y: exitY },
      { x, y: exitY },
      { x, y: entryY },
      { x: target.x, y: entryY },
      target,
    ]
  }

  if (sourceHorizontal) {
    const exitSide = edge.sourceSide === 'left' ? 'left' : 'right'
    const exitX = outerX(exitSide, nodes, railLane, source.x)
    const entrySide = edge.targetSide === 'top' ? 'top' : 'bottom'
    const entryY = outerY(entrySide, nodes, railLane, target.y)
    return [source, { x: exitX, y: source.y }, { x: exitX, y: entryY }, { x: target.x, y: entryY }, target]
  }

  const exitSide = edge.sourceSide === 'top' ? 'top' : 'bottom'
  const exitY = outerY(exitSide, nodes, railLane, source.y)
  const entrySide = edge.targetSide === 'left' ? 'left' : 'right'
  const entryX = outerX(entrySide, nodes, railLane, target.x)
  return [source, { x: source.x, y: exitY }, { x: entryX, y: exitY }, { x: entryX, y: target.y }, target]
}

function outerX(side: 'left' | 'right', nodes: RoutedNode[], lane: number, anchor: number): number {
  const pad = 20 + lane * RAIL_GAP
  if (side === 'right') {
    const edge = Math.max(anchor, ...nodes.map((node) => node.x + node.width))
    return edge + pad
  }
  const edge = Math.min(anchor, ...nodes.map((node) => node.x))
  return edge - pad
}

function outerY(side: 'top' | 'bottom', nodes: RoutedNode[], lane: number, anchor: number): number {
  const pad = 20 + lane * RAIL_GAP
  if (side === 'bottom') {
    const edge = Math.max(anchor, ...nodes.map((node) => node.y + node.height))
    return edge + pad
  }
  const edge = Math.min(anchor, ...nodes.map((node) => node.y))
  return edge - pad
}

function clearChannel(preferred: number, blocked: (value: number) => boolean, reserved: number[]): number {
  const taken = (value: number) => blocked(value) || reserved.some((used) => Math.abs(used - value) < 12)
  if (!taken(preferred)) return preferred
  for (let delta = 6; delta <= 480; delta += 6) {
    if (!taken(preferred + delta)) return preferred + delta
    if (!taken(preferred - delta)) return preferred - delta
  }
  return preferred + 24 + reserved.length * 14
}

function horizontalHits(y: number, x1: number, x2: number, nodes: RoutedNode[]): boolean {
  const left = Math.min(x1, x2)
  const right = Math.max(x1, x2)
  return nodes.some((node) => {
    const crossesY = y > node.y - CHANNEL_PAD && y < node.y + node.height + CHANNEL_PAD
    const crossesX = right > node.x && left < node.x + node.width
    return crossesY && crossesX
  })
}

function verticalHits(x: number, y1: number, y2: number, nodes: RoutedNode[]): boolean {
  const top = Math.min(y1, y2)
  const bottom = Math.max(y1, y2)
  return nodes.some((node) => {
    const crossesX = x > node.x - CHANNEL_PAD && x < node.x + node.width + CHANNEL_PAD
    const crossesY = bottom > node.y && top < node.y + node.height
    return crossesX && crossesY
  })
}

type Spine = {
  id: string
  orientation: 'h' | 'v'
  cross: number
  start: number
  end: number
}

function forwardSpine(edge: RoutedEdgeInput): Spine {
  const source = edge.sourcePoint
  const target = edge.targetPoint
  const horizontal = edge.sourceSide === 'left' || edge.sourceSide === 'right'
  if (horizontal) {
    if (Math.abs(source.y - target.y) <= 8) {
      return {
        id: edge.id,
        orientation: 'h',
        cross: (source.y + target.y) / 2,
        start: source.x,
        end: target.x,
      }
    }
    return {
      id: edge.id,
      orientation: 'v',
      cross: (source.x + target.x) / 2,
      start: source.y,
      end: target.y,
    }
  }
  if (Math.abs(source.x - target.x) <= 8) {
    return {
      id: edge.id,
      orientation: 'v',
      cross: (source.x + target.x) / 2,
      start: source.y,
      end: target.y,
    }
  }
  return {
    id: edge.id,
    orientation: 'h',
    cross: (source.y + target.y) / 2,
    start: source.x,
    end: target.x,
  }
}

function spinesOverlap(a: Spine, b: Spine): boolean {
  if (a.orientation !== b.orientation) return false
  if (Math.abs(a.cross - b.cross) > 8) return false
  const start = Math.max(Math.min(a.start, a.end), Math.min(b.start, b.end))
  const end = Math.min(Math.max(a.start, a.end), Math.max(b.start, b.end))
  return end - start > 12
}

function clusterSpines(items: Spine[]): Spine[][] {
  const parent = items.map((_, index) => index)
  const find = (index: number): number => {
    let current = index
    while (parent[current] !== current) current = parent[current] ?? current
    return current
  }
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const left = items[i]
      const right = items[j]
      if (!left || !right || !spinesOverlap(left, right)) continue
      const a = find(i)
      const b = find(j)
      if (a !== b) parent[b] = a
    }
  }
  const groups = new Map<number, Spine[]>()
  items.forEach((item, index) => {
    const root = find(index)
    const list = groups.get(root) ?? []
    list.push(item)
    groups.set(root, list)
  })
  return [...groups.values()]
}

function middleIntersects(points: Point[], nodes: RoutedNode[]): boolean {
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1]
    const to = points[i]
    if (!from || !to) continue
    if (nodes.some((node) => segmentEntersNode(from, to, node))) return true
  }
  return false
}

function segmentEntersNode(from: Point, to: Point, node: RoutedNode): boolean {
  const left = node.x + 1
  const right = node.x + node.width - 1
  const top = node.y + 1
  const bottom = node.y + node.height - 1
  if (right <= left || bottom <= top) return false
  if (Math.abs(from.y - to.y) <= 0.5) {
    const y = (from.y + to.y) / 2
    if (y <= top || y >= bottom) return false
    const start = Math.min(from.x, to.x)
    const end = Math.max(from.x, to.x)
    return end > left && start < right
  }
  if (Math.abs(from.x - to.x) <= 0.5) {
    const x = (from.x + to.x) / 2
    if (x <= left || x >= right) return false
    const start = Math.min(from.y, to.y)
    const end = Math.max(from.y, to.y)
    return end > top && start < bottom
  }
  return false
}

function dedupe(points: Point[]): Point[] {
  const next: Point[] = []
  for (const point of points) {
    const prev = next[next.length - 1]
    if (!prev || Math.hypot(point.x - prev.x, point.y - prev.y) > 0.5) next.push(point)
  }
  const simplified: Point[] = []
  for (const point of next) {
    const mid = simplified[simplified.length - 1]
    const start = simplified[simplified.length - 2]
    if (start && mid && collinear(start, mid, point)) {
      simplified[simplified.length - 1] = point
    } else {
      simplified.push(point)
    }
  }
  return simplified
}

function collinear(a: Point, b: Point, c: Point): boolean {
  return Math.abs((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)) < 0.75
}

function labelPoint(points: Point[]): Point {
  let best = -1
  let mid = points[0] ?? { x: 0, y: 0 }
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1]
    const to = points[i]
    if (!from || !to) continue
    const length = Math.hypot(to.x - from.x, to.y - from.y)
    if (length > best) {
      best = length
      mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
    }
  }
  return mid
}

function smoothPath(points: Point[]): string {
  if (points.length === 0) return ''
  const first = points[0]
  if (!first) return ''
  if (points.length === 1) return `M ${fmt(first.x)} ${fmt(first.y)}`
  let path = `M ${fmt(first.x)} ${fmt(first.y)}`
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1]
    const current = points[i]
    const next = points[i + 1]
    if (!prev || !current || !next) continue
    path += bend(prev, current, next, CORNER_RADIUS)
  }
  const last = points[points.length - 1]
  if (!last) return path
  path += `L ${fmt(last.x)} ${fmt(last.y)}`
  return path
}

function bend(a: Point, b: Point, c: Point, radius: number): string {
  const size = Math.min(distance(a, b) / 2, distance(b, c) / 2, radius)
  if (size < 0.5 || (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) {
    return `L ${fmt(b.x)} ${fmt(b.y)}`
  }
  if (a.y === b.y) {
    const xDir = a.x < c.x ? -1 : 1
    const yDir = a.y < c.y ? 1 : -1
    return `L ${fmt(b.x + size * xDir)} ${fmt(b.y)}Q ${fmt(b.x)} ${fmt(b.y)} ${fmt(b.x)} ${fmt(b.y + size * yDir)}`
  }
  const xDir = a.x < c.x ? 1 : -1
  const yDir = a.y < c.y ? -1 : 1
  return `L ${fmt(b.x)} ${fmt(b.y + size * yDir)}Q ${fmt(b.x)} ${fmt(b.y)} ${fmt(b.x + size * xDir)} ${fmt(b.y)}`
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

function fmt(value: number): string {
  const rounded = Math.round(value * 100) / 100
  return String(rounded)
}
