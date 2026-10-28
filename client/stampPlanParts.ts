type Counts = {
  heading: number
  paragraph: number
  'list-item': number
  diagram: number
  code: number
}

function freshCounts(): Counts {
  return { heading: 0, paragraph: 0, 'list-item': 0, diagram: 0, code: 0 }
}

/** Mark the rendered MDX plan so comments can grab a heading, paragraph, option, or entry. */
export function stampPlanParts(root: ParentNode): void {
  const article = root.querySelector<HTMLElement>('[data-plan-rendered]') ?? (root instanceof HTMLElement ? root : null)
  if (!article) return
  let proseIndex = 0
  let inProse = false
  let counts = freshCounts()
  for (const child of [...article.children]) {
    if (!(child instanceof HTMLElement)) continue
    if (child.matches('[data-entry]') || child.querySelector(':scope > [data-entry]')) {
      if (inProse) proseIndex += 1
      inProse = false
      counts = freshCounts()
      stampTree(child)
      continue
    }
    if (!inProse) {
      inProse = true
      counts = freshCounts()
    }
    stampProse(child, `markdown:${proseIndex}`, counts)
  }
}

function stampTree(root: HTMLElement): void {
  const entries = root.matches('[data-entry]') ? [root] : []
  entries.push(...root.querySelectorAll<HTMLElement>('[data-entry]'))
  for (const entry of entries) stampEntry(entry)
}

function stampEntry(entry: HTMLElement): void {
  const kind = entry.dataset.entry || 'part'
  const id = entry.dataset.entryId
  const scope = id ? `${kind}:${id}` : kind
  entry.classList.add('block')
  if (!entry.dataset.planPart) {
    entry.dataset.planPart = scope
    entry.dataset.planKind = kind
  }
  const title = directChild(entry, '.plan-title, .plan-callout-label')
  if (title && !title.dataset.planPart) {
    const partKind = kind === 'callout' ? 'label' : kind === 'choice' || kind === 'form' || kind === 'questions' || kind === 'approve' ? 'prompt' : 'title'
    title.dataset.planPart = `${scope}/${partKind}`
    title.dataset.planKind = partKind
  }
  for (const option of entry.querySelectorAll<HTMLElement>('button[data-option-id]')) {
    if (option.closest('[data-entry]') !== entry) continue
    const optionId = option.dataset.optionId
    if (!optionId || option.dataset.planPart) continue
    option.dataset.planPart = `${scope}/option:${optionId}`
    option.dataset.planKind = 'option'
  }
  const rich = directChild(entry, '.plan-rich')
  if (rich) {
    const counts = freshCounts()
    for (const child of [...rich.children]) {
      if (!(child instanceof HTMLElement) || child.matches('[data-entry]')) continue
      stampProse(child, scope, counts)
    }
  }
}

function stampProse(element: HTMLElement, scope: string, counts: Counts): void {
  if (element.matches('[data-entry]')) return
  const kind = proseKind(element)
  if (kind) {
    counts[kind] += 1
    if (!element.dataset.planPart) {
      element.dataset.planPart = `${scope}/${kind}:${counts[kind]}`
      element.dataset.planKind = kind
    }
  }
  if (element.tagName === 'UL' || element.tagName === 'OL') {
    for (const item of element.querySelectorAll<HTMLElement>(':scope > li')) stampProse(item, scope, counts)
  }
}

function proseKind(element: HTMLElement): keyof Counts | null {
  if (/^H[1-6]$/.test(element.tagName)) return 'heading'
  if (element.tagName === 'P') return 'paragraph'
  if (element.tagName === 'LI') return 'list-item'
  if (element.classList.contains('mermaid-diagram')) return 'diagram'
  if (element.tagName === 'PRE' || element.classList.contains('code-block')) return 'code'
  return null
}

function directChild(entry: HTMLElement, selector: string): HTMLElement | null {
  const found = entry.querySelector<HTMLElement>(selector)
  if (!found || found.closest('[data-entry]') !== entry) return null
  return found
}
