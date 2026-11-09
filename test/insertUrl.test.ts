import { describe, expect, test } from 'bun:test'
import { normalizeInsertUrl, previewableImageUrl } from '../client/editor/insertUrl.ts'

describe('normalizeInsertUrl', () => {
  test('keeps full addresses, paths, and anchors as typed', () => {
    expect(normalizeInsertUrl(' https://example.com/a?b=1 ', 'link')).toEqual({ ok: true, url: 'https://example.com/a?b=1' })
    expect(normalizeInsertUrl('mailto:team@example.com', 'link')).toEqual({ ok: true, url: 'mailto:team@example.com' })
    expect(normalizeInsertUrl('/plans/abc', 'link')).toEqual({ ok: true, url: '/plans/abc' })
    expect(normalizeInsertUrl('#phase-2', 'link')).toEqual({ ok: true, url: '#phase-2' })
    expect(normalizeInsertUrl('./diagram.png', 'image')).toEqual({ ok: true, url: './diagram.png' })
  })

  test('adds https to a bare host', () => {
    expect(normalizeInsertUrl('example.com/page', 'link')).toEqual({ ok: true, url: 'https://example.com/page' })
    expect(normalizeInsertUrl('cdn.example.com/a.png', 'image')).toEqual({ ok: true, url: 'https://cdn.example.com/a.png' })
  })

  test('refuses script and file schemes, and empty or spaced input', () => {
    expect(normalizeInsertUrl('javascript:alert(1)', 'link').ok).toBe(false)
    expect(normalizeInsertUrl('JavaScript:alert(1)', 'image').ok).toBe(false)
    expect(normalizeInsertUrl('data:text/html,<b>x</b>', 'link').ok).toBe(false)
    expect(normalizeInsertUrl('file:///etc/passwd', 'link').ok).toBe(false)
    expect(normalizeInsertUrl('   ', 'link').ok).toBe(false)
    expect(normalizeInsertUrl('two words', 'link').ok).toBe(false)
  })

  test('allows an inline image only as an image', () => {
    expect(normalizeInsertUrl('data:image/png;base64,AAAA', 'image')).toEqual({ ok: true, url: 'data:image/png;base64,AAAA' })
    expect(normalizeInsertUrl('data:image/png;base64,AAAA', 'link').ok).toBe(false)
  })
})

describe('previewableImageUrl', () => {
  test('previews finished addresses only', () => {
    expect(previewableImageUrl('https://cdn.example.com/a.png')).toBe(true)
    expect(previewableImageUrl('http://127.0.0.1:9611/favicon.png')).toBe(true)
    expect(previewableImageUrl('http://localhost:3000/a.png')).toBe(true)
    expect(previewableImageUrl('/favicon.png')).toBe(true)
    expect(previewableImageUrl('data:image/png;base64,AAAA')).toBe(true)
  })

  test('skips half-typed hosts', () => {
    expect(previewableImageUrl('https://h')).toBe(false)
    expect(previewableImageUrl('https://cdn.example')).toBe(true)
    expect(previewableImageUrl('https://cdn.e')).toBe(false)
    expect(previewableImageUrl('http://127.0.0')).toBe(false)
    expect(previewableImageUrl('ftp://example.com/a.png')).toBe(false)
  })
})
