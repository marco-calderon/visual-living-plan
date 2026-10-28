import { compile, run } from '@mdx-js/mdx'
import { useEffect, useState, type ComponentType, type ReactNode } from 'react'
import * as runtime from 'react/jsx-runtime'
import { recmaPlanComponents } from '../../mdx/recmaPlanComponents'
import { remarkMermaid } from '../../mdx/remarkMermaid'
import { planComponents } from './planComponents'

type PlanModule = ComponentType<{ components: typeof planComponents }>

type PlanDocumentProps = {
  body: string
}

const compiled = new Map<string, Promise<PlanModule>>()

function compileBody(source: string): Promise<PlanModule> {
  const cached = compiled.get(source)
  if (cached) return cached
  const pending = compile(source, {
    jsx: false,
    jsxImportSource: 'react',
    jsxRuntime: 'automatic',
    outputFormat: 'function-body',
    format: 'mdx',
    development: false,
    remarkPlugins: [remarkMermaid],
    recmaPlugins: [recmaPlanComponents],
  }).then(async (file) => {
    const loaded = await run(String(file), { ...runtime })
    return loaded.default as PlanModule
  })
  compiled.set(source, pending)
  pending.catch(() => {
    if (compiled.get(source) === pending) compiled.delete(source)
  })
  return pending
}

export function PlanDocument({ body }: PlanDocumentProps) {
  const [content, setContent] = useState<ReactNode>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    compileBody(body).then(
      (Content) => {
        if (cancelled) return
        setContent(<Content components={planComponents} />)
        setError(null)
      },
      (caught: unknown) => {
        if (cancelled) return
        setContent(null)
        setError(caught instanceof Error ? caught.message : 'Could not render the plan')
      },
    )
    return () => {
      cancelled = true
    }
  }, [body])

  if (error) {
    return (
      <p className="host-error" role="alert" data-plan-error="">
        {error}
      </p>
    )
  }
  if (!content) return <p data-plan-rendering="">Rendering plan…</p>
  return (
    <article className="plan-document" data-plan-rendered="">
      {content}
    </article>
  )
}
