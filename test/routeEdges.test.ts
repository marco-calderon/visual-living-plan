import assert from 'node:assert/strict'
import test from 'node:test'
import {
  portPoint,
  routeWorkflowEdges,
  type Point,
  type PortSide,
  type RoutedEdgeInput,
  type RoutedNode,
  type WorkflowRoute,
} from '../client/execution-canvas/adapters/reactFlow/routeEdges.ts'

test('wrapped plan steps do not fold forward edges or share a rail', () => {
  const { nodes, edges } = wrappedChain()
  const routes = routeWorkflowEdges(nodes, edges)
  const byId = new Map(routes.map((route) => [route.id, route]))

  for (const edge of edges) {
    const route = byId.get(edge.id)
    assert.ok(route, edge.id)
    assert.deepEqual(route.points[0], edge.sourcePoint)
    assert.deepEqual(route.points[route.points.length - 1], edge.targetPoint)
    assert.equal(segmentEntersAny(route.points, nodes), false, edge.id)
  }

  for (const edge of edges) {
    if (edge.targetPoint.x <= edge.sourcePoint.x) continue
    const route = byId.get(edge.id)
    assert.ok(route)
    for (const point of route.points) {
      assert.ok(point.x >= edge.sourcePoint.x - 1, `${edge.id} x ${point.x}`)
      assert.ok(point.x <= edge.targetPoint.x + 1, `${edge.id} x ${point.x}`)
    }
  }

  const rails = edges
    .filter((edge) => edge.targetPoint.x < edge.sourcePoint.x)
    .map((edge) => Math.max(...(byId.get(edge.id)?.points.map((point) => point.x) ?? [0])))
  assert.equal(rails.length, 2)
  assert.ok(Math.abs((rails[0] ?? 0) - (rails[1] ?? 0)) >= 16)
})

test('parallel edges between the same steps bow apart', () => {
  const source: RoutedNode = { id: 'a', x: 0, y: 0, width: 200, height: 90 }
  const target: RoutedNode = { id: 'b', x: 340, y: 0, width: 200, height: 90 }
  const edges = [link('one', source, target), link('two', source, target, 'right', 'left')]
  const routes = routeWorkflowEdges([source, target], edges)
  assert.equal(routes.length, 2)
  assert.notEqual(routes[0]?.path, routes[1]?.path)
  const crosses = routes.map((route) => routeCross(route, 'h'))
  assert.ok(Math.abs((crosses[0] ?? 0) - (crosses[1] ?? 0)) >= 12)
})

test('fan-in rails and stacked returns each keep their own line', () => {
  const nodes: RoutedNode[] = [
    { id: 'roles', x: 0, y: 0, width: 240, height: 130 },
    { id: 'table', x: 0, y: 168, width: 240, height: 140 },
    { id: 'registry', x: 280, y: 0, width: 240, height: 130 },
    { id: 'permission', x: 280, y: 168, width: 240, height: 140 },
    { id: 'queue', x: 560, y: 0, width: 240, height: 130 },
  ]
  const edges = [
    link('roles-reg', nodes[0]!, nodes[2]!),
    link('roles-perm', nodes[0]!, nodes[3]!),
    link('table-reg', nodes[1]!, nodes[2]!),
    link('table-perm', nodes[1]!, nodes[3]!),
    link('reg-queue', nodes[2]!, nodes[4]!),
    link('queue-perm', nodes[4]!, nodes[3]!, 'bottom', 'right'),
    link('reg-perm', nodes[2]!, nodes[3]!, 'bottom', 'right'),
  ]
  const routes = routeWorkflowEdges(nodes, edges)
  const byId = new Map(routes.map((route) => [route.id, route]))

  for (const edge of edges) {
    const route = byId.get(edge.id)
    assert.ok(route, edge.id)
    assert.deepEqual(route.points[0], edge.sourcePoint)
    assert.deepEqual(route.points[route.points.length - 1], edge.targetPoint)
    assert.equal(segmentEntersAny(route.points, nodes), false, edge.id)
  }

  const intoRegistry = verticalCross(byId.get('roles-perm'))
  const intoPermission = verticalCross(byId.get('table-reg'))
  assert.ok(Math.abs(intoRegistry - intoPermission) >= 18, `${intoRegistry} vs ${intoPermission}`)
  for (const cross of [intoRegistry, intoPermission]) {
    assert.ok(cross > 240 && cross < 280, `gutter rail ${cross}`)
  }

  const queueReturn = verticalCross(byId.get('queue-perm'))
  const registryReturn = verticalCross(byId.get('reg-perm'))
  assert.ok(Math.abs(queueReturn - registryReturn) >= 18, `${queueReturn} vs ${registryReturn}`)
})

test('a return edge into another card stays outside the cards', () => {
  const nodes: RoutedNode[] = [
    { id: 'design', x: 40, y: 40, width: 220, height: 110 },
    { id: 'implement', x: 320, y: 40, width: 220, height: 110 },
    { id: 'tests', x: 600, y: 40, width: 220, height: 110 },
    { id: 'observe', x: 880, y: 40, width: 220, height: 110 },
    { id: 'retry', x: 600, y: 280, width: 220, height: 110 },
  ]
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const edge = (id: string, source: string, target: string, sourceSide: PortSide, targetSide: PortSide) => {
    const from = byId.get(source)
    const to = byId.get(target)
    assert.ok(from && to)
    return {
      id,
      source,
      target,
      sourceSide,
      targetSide,
      sourcePoint: portPoint(from, sourceSide, 'source'),
      targetPoint: portPoint(to, targetSide, 'target'),
    } satisfies RoutedEdgeInput
  }
  const edges = [
    edge('design-implement', 'design', 'implement', 'right', 'left'),
    edge('implement-tests', 'implement', 'tests', 'right', 'left'),
    edge('tests-observe', 'tests', 'observe', 'right', 'left'),
    edge('tests-retry', 'tests', 'retry', 'bottom', 'top'),
    edge('retry-implement', 'retry', 'implement', 'left', 'bottom'),
  ]
  const routes = routeWorkflowEdges(nodes, edges)
  for (const route of routes) {
    assert.equal(segmentEntersAny(route.points, nodes), false, route.id)
    assert.ok(route.path.startsWith('M '))
  }
})

function wrappedChain(): { nodes: RoutedNode[]; edges: RoutedEdgeInput[] } {
  const specs: Array<[string, number, number, number, number]> = [
    ['design', 0, 0, 206, 114],
    ['redis', 280, 0, 200, 114],
    ['fail', 560, 0, 244, 128],
    ['limits', 0, 168, 244, 128],
    ['notes', 280, 168, 244, 128],
    ['approve', 560, 168, 244, 128],
    ['implement', 0, 336, 244, 149],
    ['observe', 280, 336, 238, 114],
    ['done', 560, 336, 196, 114],
  ]
  const nodes = specs.map(([id, x, y, width, height]) => ({ id, x, y, width, height }))
  const edges = nodes.slice(1).map((target, index) => {
    const source = nodes[index]
    assert.ok(source)
    return link(`e${index}`, source, target)
  })
  return { nodes, edges }
}

function link(
  id: string,
  source: RoutedNode,
  target: RoutedNode,
  sourceSide: PortSide = 'right',
  targetSide: PortSide = 'left',
): RoutedEdgeInput {
  return {
    id,
    source: source.id,
    target: target.id,
    sourceSide,
    targetSide,
    sourcePoint: portPoint(source, sourceSide, 'source'),
    targetPoint: portPoint(target, targetSide, 'target'),
  }
}

function segmentEntersAny(points: Point[], nodes: RoutedNode[]): boolean {
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1]
    const to = points[i]
    if (!from || !to) continue
    for (const node of nodes) {
      if (enters(from, to, node)) return true
    }
  }
  return false
}

function enters(from: Point, to: Point, node: RoutedNode): boolean {
  const left = node.x + 1
  const right = node.x + node.width - 1
  const top = node.y + 1
  const bottom = node.y + node.height - 1
  if (Math.abs(from.y - to.y) <= 0.5) {
    const y = (from.y + to.y) / 2
    if (y <= top || y >= bottom) return false
    return Math.max(from.x, to.x) > left && Math.min(from.x, to.x) < right
  }
  if (Math.abs(from.x - to.x) <= 0.5) {
    const x = (from.x + to.x) / 2
    if (x <= left || x >= right) return false
    return Math.max(from.y, to.y) > top && Math.min(from.y, to.y) < bottom
  }
  return false
}

function verticalCross(route: WorkflowRoute | undefined): number {
  assert.ok(route)
  let best = 0
  let cross = 0
  for (let i = 1; i < route.points.length; i += 1) {
    const from = route.points[i - 1]
    const to = route.points[i]
    if (!from || !to) continue
    if (Math.abs(from.x - to.x) > 0.75) continue
    const length = Math.abs(to.y - from.y)
    if (length > best) {
      best = length
      cross = (from.x + to.x) / 2
    }
  }
  assert.ok(best > 40, route.id)
  return cross
}

function routeCross(route: WorkflowRoute, orientation: 'h' | 'v'): number {
  let best = 0
  let cross = route.points[0]?.y ?? 0
  for (let i = 1; i < route.points.length; i += 1) {
    const from = route.points[i - 1]
    const to = route.points[i]
    if (!from || !to) continue
    const length = Math.hypot(to.x - from.x, to.y - from.y)
    const horizontal = Math.abs(from.y - to.y) <= 0.5
    if (length > best && ((orientation === 'h' && horizontal) || (orientation === 'v' && !horizontal))) {
      best = length
      cross = orientation === 'h' ? (from.y + to.y) / 2 : (from.x + to.x) / 2
    }
  }
  return cross
}
