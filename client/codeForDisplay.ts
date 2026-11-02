/**
 * A fenced block's text ends with the newline that closes the last line.
 * Pierre's file renderer (`linesFromFileContents`) turns that ending into an
 * empty row. A blank line in the source is an earlier empty row, so dropping
 * only the final ending leaves it in place.
 */
export function codeForDisplay(code: string): string {
  if (code.endsWith('\r\n')) return code.slice(0, -2)
  if (code.endsWith('\n') || code.endsWith('\r')) return code.slice(0, -1)
  return code
}

/** Unified diff text Pierre can parse. The fence terminator is already gone. */
export function patchText(code: string, language: string): string {
  let body = code.endsWith('\n') ? code : `${code}\n`
  if (!/^diff --git /m.test(body) && !/^---[ \t]+\S/m.test(body)) {
    const name = language ? `snippet.${language}` : 'snippet'
    body = `--- a/${name}\n+++ b/${name}\n${body}`
  }
  if (/^diff --git /m.test(body)) return body
  return body.replace(/^---[ \t]+(\S+)\n\+\+\+[ \t]+(\S+)/gm, (full, oldPath: string, newPath: string) => {
    const oldName = oldPath.replace(/^[ab]\//, '')
    const newName = newPath.replace(/^[ab]\//, '')
    const left = oldName === '/dev/null' ? newName : oldName
    const right = newName === '/dev/null' ? oldName : newName
    return `diff --git a/${left} b/${right}\n${full}`
  })
}
