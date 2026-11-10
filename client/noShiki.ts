/**
 * Stands in for Shiki in the browser builds (see the `shiki` alias in both Vite configs).
 *
 * Pierre highlights with Highlights here (`preferredHighlighter: 'highlights'` in CodeBlock.tsx).
 * It reaches Shiki only through its Shiki backends and their language and theme loaders, which
 * this app never asks for. Without this stand-in, every Shiki grammar is still built (about 9 MB)
 * and the hosted service worker precaches all of it. Each name Pierre imports is here, so the
 * build resolves; calling one means a Shiki backend was asked for, and says so.
 */
function unavailable(): never {
  throw new Error('Shiki is not bundled. Code is highlighted with Highlights (preferredHighlighter: "highlights").')
}

// shiki/core
export const createHighlighterCore = unavailable
export const createCssVariablesTheme = unavailable

// shiki/textmate: read only by Pierre's Shiki editor tokenizer.
export const INITIAL = null
export const EncodedTokenMetadata = { getForeground: unavailable, getTokenType: unavailable }

// shiki/langs: no grammars, so a lookup finds nothing and Pierre reports the language as unknown.
export const bundledLanguages: Record<string, never> = {}

// shiki/engine/javascript and shiki/engine/oniguruma
export const createJavaScriptRegexEngine = unavailable
export const createOnigurumaEngine = unavailable

// shiki/wasm
export default unavailable
