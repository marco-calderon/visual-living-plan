const PLAN_TAGS = new Set([
  'phase',
  'choice',
  'approve',
  'form',
  'questions',
  'checklist',
  'callout',
  'workflow',
  'option',
  'item',
  'field',
])

type EstreeNode = {
  type?: string
  name?: string
  value?: unknown
  callee?: EstreeNode
  arguments?: EstreeNode[]
  object?: EstreeNode
  property?: EstreeNode
  computed?: boolean
  optional?: boolean
}

/**
 * MDX compiles unknown lowercase tags as intrinsic elements (`_jsx("phase")`),
 * which ignores the component map. Point those tags at `_components.phase`
 * so the plan vocabulary resolves through the map.
 */
export function recmaPlanComponents() {
  return (tree: EstreeNode) => {
    rewrite(tree)
  }
}

function rewrite(node: EstreeNode | undefined): void {
  if (!node || typeof node !== 'object') return
  if (
    node.type === 'CallExpression' &&
    (node.callee?.name === '_jsx' || node.callee?.name === '_jsxs' || node.callee?.name === '_jsxDEV') &&
    node.arguments?.[0]?.type === 'Literal' &&
    typeof node.arguments[0].value === 'string' &&
    PLAN_TAGS.has(node.arguments[0].value)
  ) {
    const name = node.arguments[0].value
    node.arguments[0] = {
      type: 'MemberExpression',
      object: { type: 'Identifier', name: '_components' },
      property: { type: 'Identifier', name },
      computed: false,
      optional: false,
    }
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object' && 'type' in item) rewrite(item as EstreeNode)
      }
    } else if (value && typeof value === 'object' && 'type' in value) {
      rewrite(value as EstreeNode)
    }
  }
}
