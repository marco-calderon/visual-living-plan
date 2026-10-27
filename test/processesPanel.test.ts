import assert from 'node:assert/strict'
import test from 'node:test'
import { containerFolderName, PROCESSES_PANEL_STYLES, processesPanelScript } from '../src/processesPanel.ts'

const directories = [
  '/private/tmp/claude-501/work/4156d342-826b-4273-a93b-fa109bb6be66/scratchpad',
  '/private/tmp/claude-501/work/scratchpad/',
  'scratchpad',
  'C:\\Users\\mcalderon\\plans',
  'C:\\Users\\mcalderon\\plans\\',
  'foo/bar\\baz',
  '/',
  '',
]

function browserContainerFolderName(): (directory: string) => string {
  const script = processesPanelScript()
  const start = script.indexOf('function containerFolderName(directory)')
  const end = script.indexOf('function motionReduced')
  assert.ok(start >= 0 && end > start)
  return new Function(`${script.slice(start, end)}\nreturn containerFolderName;`)() as (
    directory: string,
  ) => string
}

test('plan cards use the last container folder name', () => {
  const browser = browserContainerFolderName()
  assert.equal(
    containerFolderName('/private/tmp/claude-501/work/4156d342/scratchpad'),
    'scratchpad',
  )
  assert.equal(containerFolderName('C:\\Users\\mcalderon\\plans\\'), 'plans')
  assert.equal(containerFolderName('/'), '/')
  for (const directory of directories) {
    assert.equal(browser(directory), containerFolderName(directory), directory)
  }
})

test('running plans dropdown matches the card design', () => {
  const script = processesPanelScript()
  const styles = PROCESSES_PANEL_STYLES

  assert.match(script, /aria-label', mode\.label/)
  assert.match(script, /label: 'Watch'/)
  assert.match(script, /label: 'Review'/)
  assert.match(script, /label: 'Comment'/)
  assert.match(script, /M2\.062 12\.348/)
  assert.match(script, /m9 14 2 2 4-4/)
  assert.doesNotMatch(script, /M15 3h6v6/)
  assert.doesNotMatch(script, /process-icon-btn primary/)
  assert.match(script, /title\.target = '_blank'/)
  assert.match(script, /M12 6v6l4 2/)
  assert.match(script, /M20 20a2 2 0 0 0 2-2V8/)
  assert.match(script, /M18 9a9 9 0 0 1-9 9/)
  assert.match(script, /aria-label', 'Copy path'/)
  assert.match(script, /pendingCount > 0/)
  assert.match(script, /process-pill is-pending/)
  assert.doesNotMatch(script, /process-foot/)
  assert.doesNotMatch(script, /'up ' \+ age/)
  assert.match(script, /process-pill/)
  assert.match(script, /setAttribute\('data-open'/)
  assert.match(script, /setAttribute\('data-closed'/)
  assert.doesNotMatch(script, /pid /)
  assert.doesNotMatch(script, /el\('button', 'btn', 'Copy path'\)/)
  assert.doesNotMatch(script, /textContent = 'Copy path'/)
  assert.doesNotMatch(script, /el\('span', 'chip'/)
  assert.doesNotMatch(script, /record\.planPath/)
  assert.doesNotMatch(script, /Launched from/)

  assert.match(styles, /processes-panel-in 280ms cubic-bezier\(0\.22, 1, 0\.36, 1\) both/)
  assert.match(styles, /processes-panel-out 240ms ease both/)
  assert.match(styles, /translate3d\(0, -12px, 0\) scale\(0\.96\)/)
  assert.match(styles, /\.process-mode\[data-mode="review"\]/)
  assert.match(styles, /\.process-mode\[data-mode="comment"\]/)
  assert.match(styles, /\.process-pill\.is-pending/)
  assert.match(styles, /color: var\(--accent-2\)/)
  assert.match(styles, /background: var\(--wash-warm\)/)
  assert.doesNotMatch(styles, /\.process-foot/)
  assert.doesNotMatch(styles, /\.process-icon-btn\.primary/)
  assert.match(styles, /prefers-reduced-motion: reduce/)
})
