import { gfmTaskListItemFromMarkdown, gfmTaskListItemToMarkdown } from 'mdast-util-gfm-task-list-item'
import { gfmTaskListItem } from 'micromark-extension-gfm-task-list-item'

type ExtensionData = {
  micromarkExtensions?: unknown[]
  fromMarkdownExtensions?: unknown[]
  toMarkdownExtensions?: unknown[]
}

/**
 * Parse GitHub task list items (`- [ ]` and `- [x]`) while compiling a plan.
 * The item gets a checkbox in place of the `[ ]` text, as the editor already shows it.
 */
export function remarkGfmTaskList(this: unknown): void {
  const data = (this as { data: () => ExtensionData }).data()
  const micromarkExtensions = data.micromarkExtensions ?? (data.micromarkExtensions = [])
  const fromMarkdownExtensions = data.fromMarkdownExtensions ?? (data.fromMarkdownExtensions = [])
  const toMarkdownExtensions = data.toMarkdownExtensions ?? (data.toMarkdownExtensions = [])
  micromarkExtensions.push(gfmTaskListItem())
  fromMarkdownExtensions.push(gfmTaskListItemFromMarkdown())
  toMarkdownExtensions.push(gfmTaskListItemToMarkdown())
}
