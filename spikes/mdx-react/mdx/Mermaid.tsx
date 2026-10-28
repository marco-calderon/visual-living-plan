import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react'
import { render } from 'pele'
import { collectText } from './textChildren.ts'

const FONT = '"IBM Plex Sans", "Helvetica Neue", Arial, sans-serif'
const FONT_MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace'

const diagramStyle: CSSProperties = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  margin: '0 0 0.85rem',
  border: '1px solid rgba(20, 32, 27, 0.12)',
  borderRadius: 12,
  background: 'rgba(255, 255, 255, 0.86)',
  overflow: 'hidden',
  ['--paper' as string]: '#eef3f0',
  ['--paper-2' as string]: '#e3ebe6',
  ['--ink' as string]: '#14201b',
  ['--muted' as string]: '#5b6b63',
  ['--accent' as string]: '#0f766e',
  ['--accent-2' as string]: '#b45309',
  ['--danger' as string]: '#b42318',
  ['--ok' as string]: '#166534',
  ['--font-body' as string]: FONT,
  ['--pele-bg' as string]: 'var(--paper)',
  ['--pele-fg' as string]: 'var(--ink)',
  ['--pele-muted' as string]: 'var(--muted)',
  ['--pele-line' as string]: 'var(--accent)',
  ['--pele-surface' as string]: 'color-mix(in srgb, var(--accent) 14%, var(--paper))',
  ['--pele-surface-alt' as string]: 'color-mix(in srgb, var(--accent) 8%, var(--paper-2))',
  ['--pele-border' as string]: 'var(--accent)',
  ['--pele-accent' as string]: 'var(--accent)',
  ['--pele-critical' as string]: 'var(--danger)',
  ['--pele-error' as string]: 'var(--danger)',
  ['--pele-font' as string]: 'var(--font-body)',
  ['--pele-font-mono' as string]: FONT_MONO,
  ['--pele-radius' as string]: '8px',
  ['--pele-series-1' as string]: 'var(--accent)',
  ['--pele-series-2' as string]: 'var(--accent-2)',
  ['--pele-series-3' as string]: 'var(--ok)',
  ['--pele-series-4' as string]: 'var(--danger)',
  ['--pele-series-5' as string]: 'color-mix(in srgb, var(--accent) 62%, var(--accent-2))',
  ['--pele-series-6' as string]: 'color-mix(in srgb, var(--accent-2) 68%, var(--ink))',
  ['--pele-series-7' as string]: 'color-mix(in srgb, var(--accent) 48%, var(--danger))',
  ['--pele-series-8' as string]: 'color-mix(in srgb, var(--ok) 55%, var(--accent))',
}

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
    <figure ref={hostRef} className="mermaid-diagram" data-source={source} style={diagramStyle}>
      <pre className="mermaid" style={{ margin: 0, padding: '0.85rem 1rem', whiteSpace: 'pre-wrap' }}>
        {source}
      </pre>
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
