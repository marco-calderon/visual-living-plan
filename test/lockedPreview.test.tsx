import { describe, expect, test } from 'bun:test'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { mdxFromMarkdown } from 'mdast-util-mdx'
import type { MdxJsxFlowElement } from 'mdast-util-mdx-jsx'
import { mdxjs } from 'micromark-extension-mdxjs'
import { renderToStaticMarkup } from 'react-dom/server'
import { hasLockedPreview, LOCKED_STATE, renderLockedPreview } from '../client/editor/lockedPreview.tsx'

function card(source: string): MdxJsxFlowElement {
  const tree = fromMarkdown(source, { extensions: [mdxjs()], mdastExtensions: [mdxFromMarkdown()] })
  return tree.children[0] as MdxJsxFlowElement
}

describe('locked cards in the editor', () => {
  test('forms and questions, by file or editing name, have a page preview', () => {
    for (const tag of ['form', 'plan-form', 'questions', 'choice', 'approve']) expect(hasLockedPreview(tag)).toBe(true)
    for (const tag of ['phase', 'callout', 'checklist']) expect(hasLockedPreview(tag)).toBe(false)
  })

  test('a form shows its fields as the page does, every control disabled', () => {
    const html = renderToStaticMarkup(
      <>
        {renderLockedPreview(
          card(
            '<plan-form id="f" prompt="How did it feel?">\n<field name="speed" label="Speed" type="select" options="Fast, Slow" default="Fast" />\n<field name="notes" label="Notes" type="textarea" />\n</plan-form>',
          ),
        )}
      </>,
    )
    expect(html).toContain('data-entry="form"')
    expect(html).toContain('data-locked="true"')
    expect(html).toContain('How did it feel?')
    expect(html).toContain('Speed')
    expect(html).toContain(LOCKED_STATE)
    expect(html).toMatch(/<textarea[^>]*disabled/)
    // No editing controls from the editor's own card.
    expect(html).not.toContain('plan-editor-input')
    // Every native control is disabled.
    const controls = html.match(/<(input|textarea|button)\b[^>]*>/g) ?? []
    expect(controls.length).toBeGreaterThan(0)
    for (const control of controls) expect(control).toMatch(/disabled/)
  })

  test('questions show each question with a disabled answer box', () => {
    const html = renderToStaticMarkup(
      <>{renderLockedPreview(card('<questions id="q" prompt="Open questions">\n<item>\nFirst?\n</item>\n<item>\nSecond?\n</item>\n</questions>'))}</>,
    )
    expect(html).toContain('First?')
    expect(html).toContain('Second?')
    expect((html.match(/<textarea[^>]*disabled/g) ?? []).length).toBe(2)
  })

  test('an expression prop it cannot read leaves the editor its own card', () => {
    expect(renderLockedPreview(card('<plan-form id="f" prompt={"x"}>\n<field name="a" label="A" />\n</plan-form>'))).toBeNull()
  })
})
