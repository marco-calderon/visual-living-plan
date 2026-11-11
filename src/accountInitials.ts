/**
 * One or two letters for an account, shown in place of its name where the toolbar is narrow.
 * "Ada Lovelace" is "AL", "ada@example.com" is "A", and an empty label is "?".
 */
export function accountInitials(label: string): string {
  const trimmed = label.trim()
  const name = trimmed.includes('@') ? (trimmed.split('@')[0] ?? '') : trimmed
  const words = name.split(/[\s._-]+/).filter((word) => /\p{L}|\p{N}/u.test(word))
  if (trimmed.includes('@')) return firstLetter(words[0] ?? name)
  if (words.length === 0) return '?'
  if (words.length === 1) return firstLetter(words[0] ?? '')
  return firstLetter(words[0] ?? '') + firstLetter(words[words.length - 1] ?? '')
}

function firstLetter(word: string): string {
  const letter = [...word].find((char) => /\p{L}|\p{N}/u.test(char))
  return letter ? letter.toLocaleUpperCase() : '?'
}
