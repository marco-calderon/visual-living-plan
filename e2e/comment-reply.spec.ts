import { expect, test } from '@playwright/test'

test.use({ baseURL: 'http://127.0.0.1:9478' })

test('an agent reply shows on the part thread and on the message tray', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Plan' }).click()

  const part = page.locator('[data-plan-part]').filter({ hasText: 'Redis dependency' }).first()
  await expect(part).toBeVisible()
  const partId = await part.getAttribute('data-plan-part')
  const kind = await part.getAttribute('data-plan-kind')
  expect(partId).toBeTruthy()

  const posted = await page.request.post('/api/comments', {
    data: {
      partId,
      kind,
      excerpt: 'Redis dependency',
      text: 'Mention the timeout in the runbook.',
    },
  })
  expect(posted.ok()).toBeTruthy()
  const created = (await posted.json()) as { comment: { id: string } }

  const replied = await page.request.post(`/api/comments/${created.comment.id}/reply`, {
    data: { text: 'The timeout is called out in the runbook.' },
  })
  expect(replied.ok()).toBeTruthy()

  await expect(page.getByText('The timeout is called out in the runbook.')).toBeVisible()
  await expect
    .poll(() => part.evaluate((element) => element.closest('.block')?.classList.contains('change-applied') ?? false))
    .toBe(true)

  const trayPosted = await page.request.post('/api/comments', {
    data: { partId: 'review:message', kind: 'message', text: 'Keep the verdict bar up.' },
  })
  expect(trayPosted.ok()).toBeTruthy()
  const trayCreated = (await trayPosted.json()) as { comment: { id: string } }

  const trayReply = await page.request.post(`/api/comments/${trayCreated.comment.id}/reply`, {
    data: { text: 'The verdict bar stays up.' },
  })
  expect(trayReply.ok()).toBeTruthy()

  await expect(page.getByRole('region', { name: 'Messages sent to the agent' })).toBeVisible()
  await expect(page.getByText('The verdict bar stays up.')).toBeVisible()
})
