export type PlanPartElement = HTMLElement | SVGElement

export type PlanPart = {
  partId: string
  kind: string
  excerpt: string
  element: PlanPartElement
}

function stamped(element: Element): element is PlanPartElement {
  return (
    (element instanceof HTMLElement || element instanceof SVGElement) &&
    Boolean(element.dataset.planPart)
  )
}

function hostOf(element: Element): Element | null {
  const root = element.getRootNode()
  return root instanceof ShadowRoot ? root.host : null
}

function lineFrom(start: Element): HTMLElement | null {
  const root = start.getRootNode()
  if (!(root instanceof ShadowRoot)) return null
  const line = start.closest<HTMLElement>('[data-line-index]')
  if (!line) return null
  const owner = root.host.closest<HTMLElement>('[data-plan-part]')
  const scope = owner?.dataset.planPart
  if (!owner || !scope) return null
  const index = Number(line.getAttribute('data-line-index'))
  if (!Number.isInteger(index)) return null
  const startLine = Number(owner.dataset.start || '1')
  const lineNo = index + (startLine >= 1 ? startLine : 1)
  line.dataset.planPart = `${scope}/line:${lineNo}`
  line.dataset.planKind = 'line'
  return line
}

export function selectableFrom(start: Element | null): PlanPartElement | null {
  let current: Element | null = start
  while (current) {
    if (stamped(current)) return current
    if (current.parentElement) {
      current = current.parentElement
      continue
    }
    current = hostOf(current)
  }
  return null
}

export function resolvePart(start: Element | null): PlanPartElement | null {
  if (!start || start.closest('[data-plan-grab-ignore]')) return null
  const line = lineFrom(start)
  if (line) return line
  const part = selectableFrom(start)
  if (!part || part.closest('[data-plan-grab-ignore]')) return null
  return part
}

export function describe(element: PlanPartElement): PlanPart {
  const excerpt = (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 180)
  return {
    partId: element.dataset.planPart ?? '',
    kind: element.dataset.planKind ?? 'part',
    excerpt,
    element,
  }
}

export function parentPart(element: Element): PlanPartElement | null {
  const start = element.parentElement ?? hostOf(element)
  return start ? selectableFrom(start) : null
}

export function childPart(element: Element): PlanPartElement | null {
  const child = element.querySelector('[data-plan-part]')
  return child && stamped(child) ? child : null
}

export function blockIdFromPart(partId: string): string | undefined {
  const [head] = partId.split('/')
  if (!head || head.startsWith('markdown:')) return undefined
  const id = head.slice(head.indexOf(':') + 1)
  return id || undefined
}

export function findPartElement(partId: string): PlanPartElement | null {
  const direct = document.querySelector(`[data-plan-part="${CSS.escape(partId)}"]`)
  if (direct && stamped(direct)) return direct

  const match = /^(.*)\/line:(\d+)$/.exec(partId)
  if (!match) return null
  const scope = match[1] ?? ''
  const lineNo = Number(match[2])
  const host = document.querySelector<HTMLElement>(`[data-plan-part="${CSS.escape(scope)}"]`)
  if (!host) return null
  const startLine = Number(host.dataset.start || '1')
  const index = lineNo - (startLine >= 1 ? startLine : 1)
  const roots: ParentNode[] = []
  if (host.shadowRoot) roots.push(host.shadowRoot)
  for (const node of host.querySelectorAll('*')) {
    if (node.shadowRoot) roots.push(node.shadowRoot)
  }
  for (const root of roots) {
    const line = root.querySelector<HTMLElement>(`[data-line-index="${index}"]`)
    if (!line) continue
    line.dataset.planPart = partId
    line.dataset.planKind = 'line'
    return line
  }
  return null
}

export function partLabel(kind: string, excerpt: string): string {
  const name = kind.replaceAll('-', ' ')
  if (!excerpt) return name
  const short = excerpt.length > 42 ? `${excerpt.slice(0, 42)}…` : excerpt
  return `${name} · ${short}`
}
