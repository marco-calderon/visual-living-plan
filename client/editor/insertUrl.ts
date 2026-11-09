/** What a link or image URL typed in the editor becomes, or why it cannot be used. */
export type UrlResult = { ok: true; url: string } | { ok: false; reason: string }

// A scheme the page would run or embed as a document instead of opening.
const UNSAFE_SCHEME = /^(?:javascript|vbscript|data|file):/i
const IMAGE_DATA = /^data:image\/(?:png|jpe?g|gif|webp|avif|svg\+xml);/i
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i
// Paths and anchors within the plan's own site stay as written.
const LOCAL = /^(?:\/|#|\?|\.\.?\/)/

/**
 * Tidy a URL typed into the link or image form. A bare host such as `example.com/page` gets
 * `https://`. Script and file schemes are refused; an image may also be a `data:image/...` URL.
 */
export function normalizeInsertUrl(raw: string, kind: 'link' | 'image'): UrlResult {
  const url = raw.trim()
  if (!url) return { ok: false, reason: kind === 'image' ? 'Paste the image address.' : 'Paste the link address.' }
  if (/\s/.test(url)) return { ok: false, reason: 'An address has no spaces.' }
  if (kind === 'image' && IMAGE_DATA.test(url)) return { ok: true, url }
  if (UNSAFE_SCHEME.test(url)) return { ok: false, reason: 'Use an http or https address.' }
  if (HAS_SCHEME.test(url) || LOCAL.test(url)) return { ok: true, url }
  return { ok: true, url: `https://${url}` }
}

/**
 * Whether an image address looks finished enough to load a preview: a whole http(s) address with a
 * real host, an inline image, or a path on this site. Partial input never reaches the network.
 */
export function previewableImageUrl(url: string): boolean {
  if (IMAGE_DATA.test(url) || LOCAL.test(url)) return true
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
  // The host as typed: URL fills in a short IP such as 127.0.0 to 127.0.0.0.
  const host = /^https?:\/\/(?:[^@/?#]*@)?(\[[^\]]*\]|[^/:?#]+)/i.exec(url)?.[1]?.toLowerCase() ?? ''
  return host === 'localhost' || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || /\.[a-z]{2,}$/i.test(host)
}
