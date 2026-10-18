import { render } from 'pele'
import { attachMermaidViewer, collapseMermaidViewer, releaseMermaidViewer, watchMermaidViewer } from './mermaidViewer.ts'

const FONT = '"IBM Plex Sans", "Helvetica Neue", Arial, sans-serif'
const FONT_MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace'

const PARTS = [
  '.pele-node',
  '.pele-edge',
  '.pele-edge-label',
  '.pele-cluster',
  '.pele-frame',
  '.pele-note',
  '.pele-slice',
  '.pele-task',
  '.pele-legend-item',
].join(', ')

function diagramNodes(root: ParentNode = document): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('.mermaid-diagram')]
}

function sourceOf(node: HTMLElement): string {
  const stored = node.dataset.source
  if (stored) return stored
  const source = (node.querySelector('.mermaid')?.textContent ?? '').replace(/\n$/, '')
  node.dataset.source = source
  return source
}

function showSource(node: HTMLElement, source: string, message: string): void {
  collapseMermaidViewer(node)
  releaseMermaidViewer(node)
  node.replaceChildren()
  const pre = document.createElement('pre')
  pre.className = 'code-block mermaid-fallback'
  const code = document.createElement('code')
  code.textContent = source
  pre.append(code)
  const note = document.createElement('p')
  note.className = 'mermaid-error'
  note.textContent = message
  node.append(pre, note)
}

function partToken(value: string, fallback: number): string {
  const token = value.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)
  return token || String(fallback)
}

function partKind(part: Element): string {
  if (part.classList.contains('pele-edge-label')) return 'edge-label'
  if (part.classList.contains('pele-edge')) return 'edge'
  if (part.classList.contains('pele-cluster')) return 'cluster'
  if (part.classList.contains('pele-frame')) return 'frame'
  if (part.classList.contains('pele-note')) return 'note'
  if (part.classList.contains('pele-slice')) return 'slice'
  if (part.classList.contains('pele-task')) return 'task'
  if (part.classList.contains('pele-legend-item')) return 'legend'
  return 'node'
}

function widenEdgeHits(svg: SVGSVGElement): void {
  for (const edge of svg.querySelectorAll<SVGGElement>('.pele-edge')) {
    const path = edge.querySelector<SVGPathElement>('path:not(.pele-marker)')
    if (!path) continue
    const hit = path.cloneNode() as SVGPathElement
    hit.classList.add('pele-edge-hit')
    hit.setAttribute('stroke', 'transparent')
    hit.setAttribute('stroke-width', '14')
    hit.setAttribute('fill', 'none')
    edge.insertBefore(hit, edge.firstChild)
  }
}

function stampDiagramParts(figure: HTMLElement): void {
  const scope = figure.dataset.planPart
  const svg = figure.querySelector('svg')
  if (!scope || !svg) return
  widenEdgeHits(svg)
  const used = new Set<string>()
  let index = 0
  for (const part of svg.querySelectorAll<Element>(PARTS)) {
    if (!(part instanceof SVGElement)) continue
    index += 1
    const kind = partKind(part)
    const base = partToken(part.getAttribute('data-id') || part.id, index)
    let token = base
    let duplicate = 2
    while (used.has(`${kind}:${token}`)) {
      token = `${base}-${duplicate}`
      duplicate += 1
    }
    used.add(`${kind}:${token}`)
    part.dataset.planPart = `${scope}/${kind}:${token}`
    part.dataset.planKind = kind
  }
}

function fontOptions(node: HTMLElement): { fontFamily: string; fontFamilyMono: string; fontSize: number } {
  const style = getComputedStyle(node)
  const fontSize = Number.parseFloat(style.fontSize)
  return {
    fontFamily: style.fontFamily || FONT,
    fontFamilyMono: FONT_MONO,
    fontSize: Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 16,
  }
}

let generation = 0

function renderDiagrams(root: ParentNode = document): void {
  const nodes = diagramNodes(root)
  if (nodes.length === 0) return
  const ticket = ++generation

  for (const [index, node] of nodes.entries()) {
    if (ticket !== generation) return
    const source = sourceOf(node).trim()
    if (!source) continue
    releaseMermaidViewer(node)
    const idPrefix = `living-plan-diagram-${index}-${ticket}`
    try {
      const { svg } = render(source, {
        ...fontOptions(node),
        idPrefix,
        responsive: true,
        autoDirection: false,
      })
      if (ticket !== generation) return
      node.innerHTML = svg
      const svgEl = node.querySelector('svg')
      if (svgEl instanceof SVGSVGElement) {
        stampDiagramParts(node)
        attachMermaidViewer(node, svgEl)
      }
    } catch {
      if (ticket !== generation) return
      showSource(node, source, 'This diagram could not be drawn.')
    }
  }
}

function boot(): void {
  watchMermaidViewer()
  renderDiagrams()
  void document.fonts?.ready.then(() => {
    renderDiagrams()
  })
  window.addEventListener('living-plan-document', (event) => {
    const root = (event as CustomEvent<{ root?: ParentNode }>).detail?.root
    renderDiagrams(root instanceof Element ? root : document)
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true })
} else {
  boot()
}
