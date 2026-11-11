import { openUrl } from '../openUrl'

/** Open an http(s) URL the same way the CLI does: the Mac app or the installed web app when there is one, else a browser tab. */
export function openExternal(url: string): void {
  void openUrl(url)
}
