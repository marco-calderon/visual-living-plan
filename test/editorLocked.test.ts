import { describe, expect, test } from 'bun:test'
import { isLockedNode, isLockedTag, LOCKED_ENTRY_TAGS } from '../client/editor/locked.ts'

describe('locked editor cards', () => {
  test('forms and questions are locked by their file and editing names', () => {
    expect(LOCKED_ENTRY_TAGS).toEqual(['form', 'questions'])
    expect(isLockedTag('form')).toBe(true)
    expect(isLockedTag('plan-form')).toBe(true)
    expect(isLockedTag('questions')).toBe(true)
  })

  test('other cards and rows stay editable', () => {
    for (const tag of ['phase', 'callout', 'choice', 'approve', 'checklist', 'item', 'field', 'plan-option', '', null, undefined]) {
      expect(isLockedTag(tag)).toBe(false)
    }
  })

  test('a node is locked by the tag of its markdown node', () => {
    expect(isLockedNode({ getMdastNode: () => ({ name: 'plan-form' }) })).toBe(true)
    expect(isLockedNode({ getMdastNode: () => ({ name: 'phase' }) })).toBe(false)
    expect(isLockedNode({ getTextContent: () => 'text' })).toBe(false)
    expect(isLockedNode(null)).toBe(false)
  })
})
