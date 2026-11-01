import { useEffect, useId, useRef, type ReactNode } from 'react'
import { render } from 'pele'
import { clearMermaidFigure, renderMermaidFigure } from '../mermaid.ts'
import { collectText } from './textChildren.ts'

const FONT = '"DM Sans", Inter, "Helvetica Neue", Helvetica, Arial, sans-serif'
const FONT_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

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
    renderMermaidFigure(node, idPrefix)
    return () => clearMermaidFigure(node)
  }, [idPrefix, source])

  return <figure ref={hostRef} className="mermaid-diagram" data-source={source} />
}
