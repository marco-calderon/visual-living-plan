import { gfmTableFromMarkdown, gfmTableToMarkdown } from 'mdast-util-gfm-table'
import { gfmTable } from 'micromark-extension-gfm-table'

type ExtensionData = {
  micromarkExtensions?: unknown[]
  fromMarkdownExtensions?: unknown[]
  toMarkdownExtensions?: unknown[]
}

/**
 * Parse GitHub pipe tables while compiling a plan.
 * Cell text stays markdown, so inline code, emphasis, and links still render.
 */
export function remarkGfmTable(this: unknown): void {
  const data = (this as { data: () => ExtensionData }).data()
  const micromarkExtensions = data.micromarkExtensions ?? (data.micromarkExtensions = [])
  const fromMarkdownExtensions = data.fromMarkdownExtensions ?? (data.fromMarkdownExtensions = [])
  const toMarkdownExtensions = data.toMarkdownExtensions ?? (data.toMarkdownExtensions = [])
  micromarkExtensions.push(gfmTable())
  fromMarkdownExtensions.push(gfmTableFromMarkdown())
  toMarkdownExtensions.push(gfmTableToMarkdown())
}
