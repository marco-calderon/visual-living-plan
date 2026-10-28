import { valueToEstree } from 'estree-util-value-to-estree'

type MdNode = {
  type: string
  lang?: string | null
  value?: string
  children?: MdNode[]
  name?: string | null
  attributes?: unknown[]
  data?: unknown
}

/**
 * Turn a CommonMark `mermaid` fence into a Pele `<Mermaid chart={...} />` element.
 * The chart string is a compiled literal, not an import or a call.
 */
export function remarkMermaid() {
  return (tree: MdNode) => {
    replaceMermaid(tree)
  }
}

function replaceMermaid(node: MdNode): void {
  const children = node.children
  if (!children) return
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index]
    if (!child) continue
    if (child.type === 'code' && child.lang === 'mermaid' && child.value?.trim()) {
      children[index] = mermaidElement(child.value.replace(/\n$/, ''))
      continue
    }
    replaceMermaid(child)
  }
}

function mermaidElement(source: string): MdNode {
  const literal = JSON.stringify(source)
  return {
    type: 'mdxJsxFlowElement',
    name: 'Mermaid',
    attributes: [
      {
        type: 'mdxJsxAttribute',
        name: 'chart',
        value: {
          type: 'mdxJsxAttributeValueExpression',
          value: literal,
          data: {
            estree: {
              type: 'Program',
              sourceType: 'module',
              body: [
                {
                  type: 'ExpressionStatement',
                  expression: valueToEstree(source),
                },
              ],
            },
          },
        },
      },
    ],
    children: [],
  }
}
