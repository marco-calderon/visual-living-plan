import Markdoc, { type Node } from '@markdoc/markdoc'
import { protectTableCodePipes } from './tables'

/** Parse plan markup. Table-cell escapes are a copy; callers keep the original source for stamps. */
export function parseMarkup(source: string): Node {
  return Markdoc.parse(protectTableCodePipes(source))
}
