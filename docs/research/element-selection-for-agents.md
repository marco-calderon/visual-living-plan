# Element selection that becomes an agent message

Researched 2026-10-13. Claims below are tied to the source that owns them.

The pattern Claude Artifacts uses is: point at a region, attach a short note, and send that pair with the next message so the model edits that region. The useful libraries split into three jobs. Some do the whole loop. Some only draw the picker. Some only turn a node into a stable identity the agent can act on.

## What Claude does

Claude does not publish a picker library. The product behavior is documented in two places, and they differ by artifact type.

In a doc or Markdown artifact, the user highlights text and chooses **Edit with Claude**. The edit lands where the text was marked, so the user does not describe which section they mean. Several pending edit requests can sit on different files and go out with the next message as one batch. Source: [What are artifacts and how do I use them?](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them)

In Claude Docs, selecting text and mentioning `@Claude` in a comment makes Claude reply in the thread and edit that passage. Source: [Get started with Claude Docs](https://support.claude.com/en/articles/16923645-get-started-with-claude-docs)

In Claude Science, comments pin a note to a part of an artifact. For a rendered HTML report the user turns on Comment and clicks an element. Saving a comment does not send it. Pending comments sit above the message box and travel with the next message. Claude receives each comment with its filename, the quoted selection or marked image, and the note. Comment text is capped at 1,000 characters. Comments have no thread and no resolve state; a later revision is a new comment on the new version. Source: [Comments](https://claude.com/docs/claude-science/comments)

That is the interaction to copy: a highlight, a note, a batch, then one message that already names the target.

## Full loop: pick an element and hand it to an agent

These are the libraries whose stated job is the Claude-style handoff.

### React Grab

[react-grab](https://github.com/aidenybai/react-grab) (MIT) is a dev-only overlay. Hover an element and press ⌘C or Ctrl+C. The clipboard gets the element's HTML plus the React component stack and source location, for example `in LoginForm at components/login-form.tsx:46:19`. Install with `npx grab@latest init`, or import `react-grab` only when `import.meta.env.DEV` is set. Source: [README](https://github.com/aidenybai/react-grab/blob/main/README.md)

The same package exports a selection engine at `react-grab/primitives` for a custom UI: `getElementAtPoint`, `isElementGrabbable`, and `data-react-grab-ignore` so the picker chrome is not itself selectable. Source: [README](https://github.com/aidenybai/react-grab/blob/main/README.md)

`getElementContext(element)` returns the clipboard snippet plus structured fields: `htmlPreview`, `stack`, `componentName`, `filePath`, `lineNumber`, `columnNumber`, `selector`, and `styles`. Source: [`packages/react-grab/src/primitives.ts`](https://github.com/aidenybai/react-grab/blob/main/packages/react-grab/src/primitives.ts)

It needs a React dev build. Fiber `_debugSource` is how it finds the file. A server-rendered plan page with no component source will not produce a file path.

### Inspekt

[Inspekt](https://inspekt.aylith.com/docs/) is the click-to-agent layer on top of existing click-to-source tools. Ctrl+Alt+click opens a popover with the surrounding source lines. **Send to Agent** posts a JSON grab to a localhost daemon, which appends it to `~/.inspekt/queue.jsonl`. Each agent (Claude Code, Cursor, Codex, Gemini CLI, Antigravity) runs an MCP server that reads that queue. Tools include `grab_latest`, `list_grabs`, `get_grab`, and `mark_grab_processed`. The payload includes file, line, column, component name, tag, class list, a source snippet, an optional comment, and the page URL. React source comes from fiber via [bippy](https://github.com/aidenybai/bippy); other frameworks get `data-insp-path` from `@code-inspector/core`. Source: [Inspekt docs](https://inspekt.aylith.com/docs/)

This is the closest open implementation of "the agent already has the element when the user types the request." It is a Chrome extension plus a daemon, not a widget you drop into a hosted page.

### stagewise

Two related surfaces:

The stagewise browser attaches a selected element to the next chat message. The agent receives outer HTML, DOM position, key computed styles, the bounding box, and a unique CSS selector. Shortcut is ⌘I / Ctrl+I. Multiple elements can be selected before send. Source: [DOM context selector](https://docs.stagewise.io/reference/dom-context-selector)

The injectable package [`@stagewise/toolbar`](https://www.npmjs.com/package/@stagewise/toolbar) (AGPL-3.0-only) is the older in-app toolbar: select elements, leave a comment, send that to an editor agent (Cursor, Copilot, Windsurf, Cline, and others, per the 0.6.1 readme). Its prompt builder wraps the user text, the page URL, and a `<selected_elements>` block. The collected element record includes tag, attributes, text (truncated), XPath, bounding rect, and a parent chain. Sources: [npm readme for 0.6.1](https://npmx.dev/package/@stagewise/toolbar/v/0.6.1), [`toolbar/core/src/prompts.ts`](https://github.com/stagewise-io/stagewise/blob/589104e1/toolbar/core/src/prompts.ts), [`toolbar/bridged/src/utils.tsx`](https://github.com/stagewise-io/stagewise/blob/589104e1/toolbar/bridged/src/utils.tsx)

AGPL matters if the toolbar ships inside this app. React Grab and finder are MIT.

### code-inspector-plugin

[`code-inspector-plugin`](https://github.com/zh-lx/code-inspector) is a bundler plugin (webpack, Vite, Rspack, Rsbuild, esbuild, Farm, Mako, Turbopack) for Vue, React, Svelte, Solid, Astro, and others. It injects `data-insp-path` at build time. Holding Option+Shift (Alt+Shift on Windows) highlights a node; click opens the IDE at that source. `pathType` is `relative` or `absolute`. Source: [Quick start](https://inspector.fe-dev.cn/en/guide/start.html), [Advanced configuration](https://inspector.fe-dev.cn/en/api/advance.html)

It also has an in-browser AI assistant. `behavior.ai` can enable `claudeCode`, `codex`, or `opencode`. A click then opens a chat that already carries that node's source context. Wheel switches parent/child; right-click opens a DOM tree. Source: [AI Assistant](https://inspector.fe-dev.cn/en/guide/feature/ai.html), [Quick element selection](https://inspector.fe-dev.cn/en/guide/feature/select-dom.html)

This is a dev-server tool. The attribute can be left in a production build (`server: 'close'`), but the assistant talks to a local service.

### Onlook

[Onlook](https://docs.onlook.com/developers/architecture) is a visual editor, not a comment widget. It loads the local app, edits the live DOM, and writes those edits back by an attribute injected at build time that points at the code block and component scope. Edits are stored as serializable actions so an agent could emit the same actions later. Source: [Architecture](https://docs.onlook.com/developers/architecture)

Useful as a model of "selection identity is a source location, and the change is an action," not as a drop-in for a hosted plan page.

### v0 Design Mode

v0's Design Mode lets the user click an element and edit visual properties directly, and it also puts the selection in the prompt as a badge so the next message is targeted. Related elements that share code highlight together. Targeting does not confine the model to that node; layout changes often require the parent. Direct property edits update code without a model call. Source: [Edit UI with v0's design mode](https://community.vercel.com/t/edit-ui-with-v0s-design-mode/17477), [How to prompt v0](https://vercel.com/blog/how-to-prompt-v0)

Closed product. The badge-in-the-composer detail is the part worth copying.

## Picker only

### `@botanicastudios/element-selector`

A hover overlay with a promise API. `launchSelector()` works from a script tag; the `standalone` entry bundles its own renderer in a shadow root so the host page does not need React. Select mode returns the element, a generated CSS selector, id, classes, tag, text preview, truncated HTML (about 2 kB by default), sibling HTML before and after, and a `markdownSummary`. Insert mode returns the drop edge between siblings. Multi-select, keyboard confirm, and retained highlights are options. Source: [README](https://github.com/botanicastudios/element-selector/blob/main/README.md)

This is the practical picker for a page that is not a React component tree. It does not talk to an agent. The caller sends `markdownSummary` (or the structured fields) on whatever channel it already has.

The README does not state a license.

### `@medv/finder`

MIT. About 1.5 kB gzipped. `finder(element)` returns a short unique CSS selector. Options cover root, a timeout that falls back to `nth-child`, and predicates for which ids, classes, tags, and attributes may appear in the selector. Source: [npm README](https://www.npmjs.com/package/@medv/finder), [antonmedv/finder](https://github.com/antonmedv/finder)

Use it when the page has no stable ids. Prefer an existing id or `data-*` attribute when one exists; generated selectors that depend on `nth-of-type` break when the plan re-renders.

`optimal-select` is the older alternative with skip/priority/ignore patterns and a virtual-DOM mode. Source: [autarc/optimal-select](https://github.com/autarc/optimal-select)

## Click-to-source, no agent message

These open the IDE. They matter because React Grab, Inspekt, and code-inspector all sit on the same idea: the DOM node carries a source location.

| Library | What the click does | Source |
|---|---|---|
| [LocatorJS](https://github.com/infi-pc/locatorjs) | Opens the component in the IDE. React, Solid, Preact, Svelte, Vue. | README |
| [react-dev-inspector](https://github.com/zthxxx/react-dev-inspector) | Same, React-focused. Listed by LocatorJS as prior art. | LocatorJS README |
| [click-to-component](https://github.com/ericclemmons/click-to-component) | Option-click opens the component. | LocatorJS README |

Inspekt's own comparison marks LocatorJS as dormant and code-inspector and React Grab as maintained in 2026. That table is Inspekt's claim, not an independent audit. Source: [Inspekt docs](https://inspekt.aylith.com/docs/)

## What to send the agent

Across these tools the payload that actually helps is small:

| Field | Who includes it | Why it matters |
|---|---|---|
| Stable identity | Claude (quoted text or filename), finder (CSS selector), this repo's `data-plan-ref` / `data-interaction-id` | The agent must name the same node after a re-render |
| Source location | React Grab, Inspekt, code-inspector, Onlook | File and line beat a description of the UI |
| Snippet | React Grab HTML preview, Inspekt source lines, element-selector `markdownSummary` | Enough local context to edit without re-reading the page |
| User note | Claude comment, Inspekt `comment`, stagewise prompt | The change request, separate from the target |
| Box and styles | stagewise | Layout requests ("make this larger") need geometry |

Claude Science batches comments and sends them with the next message. v0 shows the selection as a badge in the composer. Both keep the note and the target in one turn.

## Fit for this repo

The hosted plan page is rendered HTML, not a component tree with source maps. Blocks already carry stable handles in `src/render.ts`: `data-plan-ref` on the anchor, and `data-interaction-id` plus choice, approve, form, and question ids on the interactive blocks.

For that page, a source-mapping devtool (React Grab, Inspekt, code-inspector, LocatorJS) will not point at the plan file. The agent already speaks block ids. A picker should walk from the clicked node to the nearest `data-plan-ref` or `data-interaction-id`, attach the user's note, and push that on the existing agent stream. `@botanicastudios/element-selector` can draw the overlay. `@medv/finder` is only needed for nodes that have no plan id, and its `attr` option can be set to prefer `data-plan-ref` and `data-interaction-id`.

For the React Flow client under `client/`, React Grab's primitives or code-inspector's `data-insp-path` are the right tools, because those clicks should resolve to a source file.

`@stagewise/toolbar` already implements select-plus-comment, and its license is AGPL-3.0-only.
