import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { getElementContext } from 'react-grab/primitives'

type Summary = {
  componentName: string | null
  filePath: string | null
  lineNumber: number | null
  columnNumber: number | null
  stackLength: number
  selector: string | null
  hasFiber: boolean
  snippet: string
}

async function summarize(element: Element): Promise<Summary> {
  const ctx = await Promise.race([
    getElementContext(element),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('getElementContext timed out')), 3000)
    }),
  ])
  return {
    componentName: ctx.componentName,
    filePath: ctx.filePath,
    lineNumber: ctx.lineNumber,
    columnNumber: ctx.columnNumber,
    stackLength: ctx.stack.length,
    selector: ctx.selector,
    hasFiber: ctx.fiber !== null,
    snippet: ctx.snippet,
  }
}

function publish(payload: unknown) {
  const out = document.createElement('pre')
  out.id = 'grab-result'
  out.textContent = JSON.stringify(payload)
  document.body.append(out)
}

function CanvasLabel() {
  return createElement(
    'button',
    { className: 'canvas-label', type: 'button' },
    'Execution',
  )
}
CanvasLabel.displayName = 'CanvasLabel'

async function main() {
  const heading = document.querySelector('[data-plan-ref="design"] h3')
  const paragraph = document.querySelector('[data-plan-ref="design"] .rich p')
  const planHeading = heading ? await summarize(heading) : { error: 'missing phase heading' }
  const planParagraph = paragraph ? await summarize(paragraph) : { error: 'missing phase paragraph' }
  const host = document.getElementById('execution-root')
  if (!host) {
    publish({ planHeading, planParagraph, canvas: { error: 'missing execution root' } })
    return
  }
  createRoot(host).render(createElement(CanvasLabel))
  await new Promise((resolve) => setTimeout(resolve, 50))
  const label = host.querySelector('.canvas-label')
  const canvas = label ? await summarize(label) : { error: 'missing react label' }
  publish({ planHeading, planParagraph, canvas })
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  publish({ error: message })
})
