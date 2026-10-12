import { spawn } from 'node:child_process'

/** Open an http(s) URL in the browser, the same way the dashboard Open link does. */
export function openExternal(url: string): void {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
  const commandArgs = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
  const child = spawn(command, commandArgs, { stdio: 'ignore', detached: true })
  child.on('error', () => {
    // A missing opener must not take down the terminal UI.
  })
  child.unref()
}
