/** Provider ids already stored on this user. Better Auth writes these rows when linking succeeds. */
export async function listLinkedAccounts(
  db: D1Database,
  userId: string,
): Promise<Array<{ providerId: string }>> {
  const listed = await db
    .prepare('SELECT providerId FROM account WHERE userId = ?')
    .bind(userId)
    .all<{ providerId: string }>()
  const seen = new Set<string>()
  const accounts: Array<{ providerId: string }> = []
  for (const row of listed.results ?? []) {
    if (!row?.providerId || seen.has(row.providerId)) continue
    seen.add(row.providerId)
    accounts.push({ providerId: row.providerId })
  }
  return accounts
}
