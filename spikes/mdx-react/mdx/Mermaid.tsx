import { useEffect, useId, useRef, type ReactNode } from 'react'
import { render } from 'pele'
import { collectText } from './textChildren.ts'

const FONT = '"IBM Plex Sans", "Helvetica Neue", Arial, sans-serif'
const FONT_MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace'

type MermaidProps = {
  chart?: string
  children?: ReactNode
}

type MermaidFonts = {
  fontFamily: string
  fontFamilyMono: string
  fontSize: number
}

/** Draw a mermaid figure with Pele, matching the plan page's render options. */
export function renderMermaidSvg(source: string, idPrefix: string, fonts?: Partial<MermaidFonts>): string {
  const { svg } = render(source, {
    fontFamily: fonts?.fontFamily || FONT,
    fontFamilyMono: fonts?.fontFamilyMono || FONT_MONO,
    fontSize: fonts?.fontSize && fonts.fontSize > 0 ? fonts.fontSize : 16,
    idPrefix,
    responsive: true,
    autoDirection: false,
  })
  return svg
}

export function Mermaid({ chart, children }: MermaidProps) {
  const source = (chart ?? collectText(children)).replace(/\n$/, '').trim()
  const hostRef = useRef<HTMLElement>(null)
  const reactId = useId().replace(/[^A-Za-z0-9_-]+/g, '')
  const idPrefix = `mdx-diagram-${reactId || 'plan'}`

  useEffect(() => {
    const node = hostRef.current
    if (!node || !source) return
    const style = getComputedStyle(node)
    const fontSize = Number.parseFloat(style.fontSize)
    try {
      const svg = renderMermaidSvg(source, idPrefix, {
        fontFamily: style.fontFamily || FONT,
        fontSize: Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 16,
      })
      node.innerHTML = svg
      const svgEl = node.querySelector('svg')
      if (svgEl instanceof SVGSVGElement) widenEdgeHits(svgEl)
    } catch {
      showSource(node, source)
    }
  }, [idPrefix, source])

  return (
    <figure ref={hostRef} className="mermaid-diagram" data-source={source}>
      <pre className="mermaid">{source}</pre>
    </figure>
  )
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

function showSource(node: HTMLElement, source: string): void {
  node.replaceChildren()
  const pre = document.createElement('pre')
  pre.className = 'code-block mermaid-fallback'
  const code = document.createElement('code')
  code.textContent = source
  pre.append(code)
  const note = document.createElement('p')
  note.className = 'mermaid-error'
  note.textContent = 'This diagram could not be drawn.'
  node.append(pre, note)
}
