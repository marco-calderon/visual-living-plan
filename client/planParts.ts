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

/** Controls a person answers the plan with. A label counts: a click on it works its control, like a choice option card. */
const CONTROL = 'button, input, textarea, select, label'

/**
 * A control inside a part does its own job, not a comment: Approve and Deny, a choice option, a
 * form's Submit, a note box. Grabbing the click would swallow the answer, so the agent never hears
 * it. The card around the control still takes a comment. A control stamped as a part itself is
 * still grabbed.
 */
function insideControl(start: Element): boolean {
  const control = start.closest(CONTROL)
  return control != null && !stamped(control)
}

export function resolvePart(start: Element | null): PlanPartElement | null {
  if (!start || start.closest('[data-plan-grab-ignore]') || insideControl(start)) return null
  const line = lineFrom(start)
  if (line) return line
  const part = selectableFrom(start)
  if (!part || part.closest('[data-plan-grab-ignore]')) return null
  return part
}

const INLINE = new Set(['A', 'ABBR', 'B', 'CODE', 'EM', 'I', 'KBD', 'MARK', 'S', 'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP', 'U'])

/** The text a reader sees, with a space where one block ends and the next begins. textContent runs them together. */
export function readableText(element: Element): string {
  const parts: string[] = []
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? '')
      return
    }
    if (!(node instanceof Element)) return
    const block = !INLINE.has(node.tagName)
    if (block) parts.push(' ')
    for (const child of node.childNodes) walk(child)
    if (block) parts.push(' ')
  }
  for (const child of element.childNodes) walk(child)
  return parts.join('').replace(/\s+/g, ' ').trim()
}

export function describe(element: PlanPartElement): PlanPart {
  const excerpt = readableText(element).slice(0, 180)
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

/** Replay the same wash used when a plan block changes, on the block that owns this part. */
export function highlightChangedPart(partId: string): void {
  const element = findPartElement(partId)
  if (!element) return
  const block = element.closest('.block')
  const target = block instanceof HTMLElement ? block : element instanceof HTMLElement ? element : null
  if (!target) return
  document.body.classList.add('plan-live')
  target.classList.remove('change-applied')
  void target.offsetWidth
  target.classList.add('change-applied')
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
