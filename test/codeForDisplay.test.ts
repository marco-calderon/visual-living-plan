import assert from 'node:assert/strict'
import test from 'node:test'
import { preloadFile, preloadPatchDiff } from '@pierre/diffs/ssr'
import { codeForDisplay, patchText } from '../client/codeForDisplay.ts'

const theme = 'pierre-dark'

function renderedLines(html: string): string[] {
  return [...html.matchAll(/<div data-line="\d+"[^>]*>([\s\S]*?)<\/div>/g)].map((match) =>
    match[1]
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/\n/g, ''),
  )
}

async function fileLines(code: string): Promise<string[]> {
  const rendered = await preloadFile({
    file: { name: 'snippet.sh', contents: codeForDisplay(code), lang: 'bash' },
    options: { disableFileHeader: true, theme },
  })
  return renderedLines(rendered.prerenderedHTML)
}

async function diffLines(code: string, language = ''): Promise<string[]> {
  const rendered = await preloadPatchDiff({
    patch: patchText(codeForDisplay(code), language),
    options: { disableFileHeader: true, diffStyle: 'unified', theme },
  })
  return renderedLines(rendered.prerenderedHTML)
}

test('a trailing newline is not an extra empty line, and a blank line in the source stays', async () => {
  assert.deepEqual(await fileLines('npm test\n'), ['npm test'])
  assert.deepEqual(await fileLines('npm test\n\necho done\n'), ['npm test', '', 'echo done'])
  assert.deepEqual(await fileLines('npm test\n\n'), ['npm test', ''])

  assert.deepEqual(await diffLines('@@ -1 +1 @@\n-old\n+npm test\n', 'sh'), ['old', 'npm test'])
  assert.deepEqual(
    await diffLines(
      ['--- a/note.txt', '+++ b/note.txt', '@@ -1,3 +1,3 @@', ' keep', '-old', '+', ' next', ''].join('\n'),
    ),
    ['keep', 'old', '', 'next'],
  )
})
