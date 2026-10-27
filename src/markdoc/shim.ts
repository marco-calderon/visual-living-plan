const FENCE_RE =
  /^```(phase|choice|approve|form|questions|checklist|callout|workflow)\s*\n([\s\S]*?)^```/gm

/**
 * Old plans are YAML fences. Markdoc sees the same block as a tag whose body is that YAML.
 * Line-anchored fences match the previous parser, so a fence indented inside a body stays put.
 */
/** Longer than any backtick run in the YAML, so an indented ```mermaid fence stays inside it. */
function fenceMarker(yamlBody: string): string {
  let longest = 2
  for (const match of yamlBody.matchAll(/`+/g)) longest = Math.max(longest, match[0].length)
  return '`'.repeat(Math.max(3, longest + 1))
}

export function rewriteFencesToTags(body: string): string {
  return body.replace(FENCE_RE, (_match, kind: string, yamlBody: string) => {
    const marker = fenceMarker(yamlBody)
    const yaml = yamlBody.endsWith('\n') ? yamlBody : `${yamlBody}\n`
    return `{% ${kind} %}\n${marker}yaml\n${yaml}${marker}\n{% /${kind} %}`
  })
}
