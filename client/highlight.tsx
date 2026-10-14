import { createRoot } from 'react-dom/client'
import { CodeBlock } from './CodeBlock'

function codeHosts(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('pre.code-block')].filter(
    (node) => !node.classList.contains('mermaid-fallback'),
  )
}

function languageOf(node: HTMLElement): string {
  return node.dataset.lang?.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
}

function startingLineOf(node: HTMLElement): number | undefined {
  const value = Number(node.dataset.start)
  if (!Number.isInteger(value) || value < 1) return undefined
  return value
}

function mount(node: HTMLElement): void {
  const code = node.querySelector('code')?.textContent ?? ''
  const host = document.createElement('div')
  host.className = 'code-host'
  if (node.dataset.planPart) host.dataset.planPart = node.dataset.planPart
  if (node.dataset.planKind) host.dataset.planKind = node.dataset.planKind
  if (node.dataset.start) host.dataset.start = node.dataset.start
  node.replaceWith(host)
  createRoot(host).render(
    <CodeBlock
      code={code}
      language={languageOf(node)}
      startingLineNumber={startingLineOf(node)}
      diff={node.dataset.diff === 'true'}
    />,
  )
}

function boot(): void {
  for (const node of codeHosts()) mount(node)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true })
} else {
  boot()
}
