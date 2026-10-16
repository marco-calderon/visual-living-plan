import mermaid from 'mermaid'
import { attachMermaidViewer, collapseMermaidViewer, releaseMermaidViewer, watchMermaidViewer } from './mermaidViewer.ts'

const FONT = '"IBM Plex Sans", "Helvetica Neue", Arial, sans-serif'

function diagramNodes(root: ParentNode = document): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('.mermaid-diagram')]
}

function readVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  const value = match?.[1]
  if (!value) return null
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  }
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

function configure(): void {
  const dark = document.documentElement.dataset.theme === 'dark'
  const accent = readVar('--accent') || (dark ? '#2dd4bf' : '#0f766e')
  const ink = readVar('--ink') || (dark ? '#e8f3ee' : '#14201b')
  const paper = readVar('--paper') || (dark ? '#101816' : '#eef3f0')
  const rgb = hexToRgb(accent)
  const fill = rgb
    ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${dark ? 0.22 : 0.14})`
    : accent

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    logLevel: 'error',
    fontFamily: FONT,
    darkMode: dark,
    theme: 'base',
    themeVariables: {
      fontFamily: FONT,
      darkMode: dark,
      background: 'transparent',
      primaryColor: fill,
      primaryTextColor: ink,
      primaryBorderColor: accent,
      secondaryColor: fill,
      secondaryTextColor: ink,
      secondaryBorderColor: accent,
      tertiaryColor: paper,
      tertiaryTextColor: ink,
      tertiaryBorderColor: accent,
      lineColor: accent,
      textColor: ink,
      mainBkg: fill,
      nodeBorder: accent,
      nodeTextColor: ink,
      titleColor: ink,
      edgeLabelBackground: paper,
      clusterBkg: fill,
      clusterBorder: accent,
      actorBkg: fill,
      actorBorder: accent,
      actorTextColor: ink,
      signalColor: accent,
      signalTextColor: ink,
      noteBkgColor: fill,
      noteTextColor: ink,
      noteBorderColor: accent,
    },
    flowchart: { htmlLabels: false },
  })
}

const DIAGRAM_PARTS = 'g.node, g.actor, g.edgePath, g.edgeLabel, g.note, g.cluster, g.messageText, g.loop'

function partToken(value: string, fallback: number): string {
  const token = value.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)
  return token || String(fallback)
}

function stampDiagramParts(figure: HTMLElement): void {
  const scope = figure.dataset.planPart
  const svg = figure.querySelector('svg')
  if (!scope || !svg) return
  let index = 0
  for (const part of svg.querySelectorAll<SVGGElement>(DIAGRAM_PARTS)) {
    index += 1
    const kind = part.classList.contains('edgePath')
      ? 'edge'
      : part.classList.contains('edgeLabel')
        ? 'edge-label'
        : 'node'
    part.dataset.planPart = `${scope}/${kind}:${partToken(part.id, index)}`
    part.dataset.planKind = kind
  }
}

let generation = 0

async function renderDiagrams(root: ParentNode = document): Promise<void> {
  const nodes = diagramNodes(root)
  if (nodes.length === 0) return
  const ticket = ++generation
  configure()

  for (const [index, node] of nodes.entries()) {
    if (ticket !== generation) return
    const source = sourceOf(node).trim()
    if (!source) continue
    releaseMermaidViewer(node)
    const id = `living-plan-mermaid-${index}-${ticket}`
    try {
      const parsed = await mermaid.parse(source, { suppressErrors: true })
      if (ticket !== generation) return
      if (parsed === false) {
        showSource(node, source, 'This diagram could not be drawn.')
        continue
      }
      const { svg } = await mermaid.render(id, source)
      if (ticket !== generation) return
      node.innerHTML = svg
      const svgEl = node.querySelector('svg')
      if (svgEl instanceof SVGSVGElement) {
        stampDiagramParts(node)
        attachMermaidViewer(node, svgEl)
      }
    } catch {
      if (ticket !== generation) return
      document.getElementById(id)?.remove()
      showSource(node, source, 'This diagram could not be drawn.')
    }
  }
}

function boot(): void {
  watchMermaidViewer()
  void renderDiagrams()
  window.addEventListener('living-plan-theme', () => {
    void renderDiagrams()
  })
  window.addEventListener('living-plan-document', (event) => {
    const root = (event as CustomEvent<{ root?: ParentNode }>).detail?.root
    void renderDiagrams(root instanceof Element ? root : document)
  })
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    void renderDiagrams()
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true })
} else {
  boot()
}
