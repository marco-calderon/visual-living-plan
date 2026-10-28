import assert from 'node:assert/strict'
import test from 'node:test'
import { renderPlanStaticHtml } from '../src/planMdx/source.ts'
import { splitStepHeading, stepNumberFor } from '../src/planStepHeading.ts'
import { workflowStepHash } from '../src/planRefNavigation.ts'
import { stepNeedsFrame } from '../client/execution-canvas/stepNeedsFrame.ts'

test('a numbered title keeps the number in the box and the label below it', () => {
  assert.deepEqual(splitStepHeading('7. Merge #883 and put build 8 on feature'), {
    number: '7',
    label: 'Merge #883 and put build 8 on feature',
  })
  assert.deepEqual(stepNumberFor('Confirm limiter design', 2), {
    number: '2',
    label: 'Confirm limiter design',
  })
  assert.equal(workflowStepHash('merge'), '#workflow/merge')
  assert.equal(workflowStepHash('fail mode'), '#workflow/fail%20mode')
})

test('static phase markup exposes the number, spinner, and workflow jump', () => {
  const html = renderPlanStaticHtml(`<phase id="merge" title="7. Merge #883 and put build 8 on feature" status="active">
Merge-ready.
</phase>
<phase id="next" title="Watch the deploy" status="pending">
After the merge.
</phase>
`)
  assert.match(html, /data-status="active"/)
  assert.match(html, /class="plan-step-number" href="#workflow\/merge" data-workflow-jump="merge" aria-label="Step 7"><span class="plan-step-digit">7<\/span></)
  assert.match(html, /class="plan-step-label" href="#workflow\/merge" data-workflow-jump="merge">Merge #883 and put build 8 on feature</)
  const heading = html.slice(html.indexOf('plan-step-heading'), html.indexOf('</section>'))
  assert.ok(heading.indexOf('plan-step-label') < heading.indexOf('plan-phase-status'))
  assert.match(html, /class="rf-progress-icon"/)
  assert.doesNotMatch(html, /plan-step-label[^>]*>7\. Merge/)
  assert.match(html, /data-status="pending"/)
  assert.match(html, /aria-label="Step 2"><span class="plan-step-digit">2<\/span></)
  assert.match(html, /data-workflow-jump="next"/)
  assert.equal((html.match(/rf-progress-icon/g) ?? []).length, 1)
})

test('a workflow step needs a closer view when it is offscreen or tiny', () => {
  const bounds = { top: 0, left: 0, right: 800, bottom: 600 }
  assert.equal(
    stepNeedsFrame({ top: 40, left: 40, right: 240, bottom: 120, width: 200, zoom: 1, bounds }),
    false,
  )
  assert.equal(
    stepNeedsFrame({ top: 40, left: 900, right: 1100, bottom: 120, width: 200, zoom: 1, bounds }),
    true,
  )
  assert.equal(
    stepNeedsFrame({ top: 40, left: 40, right: 140, bottom: 80, width: 200, zoom: 0.4, bounds }),
    true,
  )
})
