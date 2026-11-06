/** Path of the hosted page that shows a token for a terminal with no browser. */
export const CLI_TOKEN_PATH = '/cli-token'

/** The command the token page tells the person to paste. */
export function cliLoginCommand(baseUrl: string, token: string): string {
  return `live-plan account login --url ${baseUrl} --token ${token}`
}

export type CliToken = { token: string; url: string; expiresAt: string }

/** Ask the host for a new terminal token with the browser session cookie. */
export async function mintCliToken(fetchImpl: typeof fetch = fetch): Promise<CliToken> {
  const response = await fetchImpl('/api/account/cli-token', { method: 'POST', credentials: 'same-origin' })
  if (!response.ok) {
    const message = (await response.text()).trim()
    throw new Error(response.status === 401 ? 'Sign in again to make a token.' : message || 'Could not make a token.')
  }
  return (await response.json()) as CliToken
}
