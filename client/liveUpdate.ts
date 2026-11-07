/**
 * Keeping the reader's place, and pointing at what changed, when a new version of the plan renders.
 * Safari has no scroll anchoring, so the page restores the position itself.
 */

export type ScrollAnchor = { element: Element; top: number; scrollY: number }

/** Blocks a reader can see changing: the article's direct children and every plan entry inside them. */
function blocks(root: ParentNode): HTMLElement[] {
  const article = root.querySelector('[data-plan-rendered]')
  if (!article) return []
  const found = new Set<HTMLElement>()
  for (const child of article.children) if (child instanceof HTMLElement) found.add(child)
  for (const entry of article.querySelectorAll<HTMLElement>('[data-entry]')) found.add(entry)
  return [...found]
}

/** The first block still on screen, and where it sits. */
export function scrollAnchor(root: ParentNode | null): ScrollAnchor | null {
  if (!root || typeof window === 'undefined') return null
  const article = root.querySelector('[data-plan-rendered]')
  if (!article) return null
  for (const child of article.children) {
    const rect = child.getBoundingClientRect()
    if (rect.bottom > 0 && rect.height > 0) return { element: child, top: rect.top, scrollY: window.scrollY }
  }
  return null
}

/** Put the anchor block back where it was. If it is gone, keep the old scroll offset. */
export function restoreScrollAnchor(anchor: ScrollAnchor | null): void {
  if (!anchor) return
  if (anchor.element.isConnected) {
    const delta = anchor.element.getBoundingClientRect().top - anchor.top
    if (Math.abs(delta) >= 1) window.scrollBy(0, delta)
    return
  }
  if (Math.abs(window.scrollY - anchor.scrollY) >= 1) window.scrollTo(0, anchor.scrollY)
}

export type BlockSignatures = Map<string, { element: HTMLElement; text: string }>

/**
 * What each block shows, keyed by its plan part. Code and diagrams are drawn after the page renders,
 * so they count by their source instead of the drawn text.
 */
export function readBlockSignatures(root: ParentNode): BlockSignatures {
  const signatures: BlockSignatures = new Map()
  blocks(root).forEach((element, index) => {
    const key = element.dataset.planPart || `${element.tagName}:${index}`
    if (!signatures.has(key)) signatures.set(key, { element, text: signatureOf(element) })
  })
  return signatures
}

function signatureOf(element: HTMLElement): string {
  const parts: string[] = []
  const walk = (node: Node) => {
    if (node instanceof HTMLElement) {
      if (node.matches('.code-host, .mermaid-diagram')) {
        parts.push(node.dataset.source ?? '')
        return
      }
      if (node.dataset.status) parts.push(`[${node.dataset.status}]`)
    }
    if (node.nodeType === Node.TEXT_NODE) parts.push(node.textContent ?? '')
    for (const child of node.childNodes) walk(child)
  }
  walk(element)
  return parts.join('')
}

/** Flash the blocks whose content changed or that are new. A nested change marks only the innermost block. */
export function markChangedBlocks(root: ParentNode, previous: BlockSignatures, next: BlockSignatures): HTMLElement[] {
  const changed: HTMLElement[] = []
  for (const [key, { element, text }] of next) {
    const before = previous.get(key)
    if (!before || before.text !== text) changed.push(element)
  }
  const innermost = changed.filter((element) => !changed.some((other) => other !== element && element.contains(other)))
  // A rewrite of most of the plan is not news about one block.
  if (innermost.length === 0 || innermost.length > Math.max(4, next.size / 2)) return []
  for (const element of innermost) {
    element.classList.remove('plan-changed')
    void element.offsetWidth
    element.classList.add('plan-changed')
    element.addEventListener('animationend', () => element.classList.remove('plan-changed'), { once: true })
  }
  void root
  return innermost
}
