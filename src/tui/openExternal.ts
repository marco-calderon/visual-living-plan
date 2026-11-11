import { openUrl } from '../openUrl'

/** Open an http(s) URL the same way the CLI does: the installed app when there is one, else a browser tab. */
export function openExternal(url: string): void {
  openUrl(url)
}
