# MiniMax-inspired document design

## Overview

MiniMax stages itself as a Chinese AI infrastructure brand with a sophisticated dual identity. Marketing surfaces and platform pages anchor in stark white canvas with deep-black typographic emphasis — the brand voice is confident, technical, almost editorial. But each model release gets its own vibrant gradient identity card: M2.7 in volcanic coral-red, Music 2.6 in magenta-pink, Hailuo in deep blue, Speech 2.8 in saturated orange-purple. Together these vibrant tiles read like album covers laid out on the homepage — each one declaring its own product personality.

DM Sans anchors every surface from oversized 80px hero displays down to 12px micro labels. The geometric, slightly humanist character of the face suits both the dense documentation surfaces (where 14px body type carries 1.5 line-height for long-form prose) and the high-impact marketing displays (where -2px letter-spacing tightens 80px headlines). Buttons are universally pill-shaped (`rounded-full`) with a sharp two-tier system: black-pill primary (the dominant CTA) and outline-pill secondary. Cards split into two distinct families: vibrant gradient product showcases (32px corner softening) and quiet white documentation cards (16px corner softening).

**Key Characteristics:**
- Stark monochrome palette — black (`colors.primary`) and white (`colors.canvas`) — broken open by saturated brand-color gradient cards
- Distinct product-color encoding: each model line has its own vibrant brand color (coral M2.7, magenta Music 2.6, blue Hailuo, orange Speech 2.8)
- DM Sans across the entire system; Inter as fallback
- Pill-shaped buttons (`rounded.full`) and pill-shaped tabs everywhere; rectangular forms only inside data tables and dense docs
- Hero typography uses tight 1.10 line-height with -2px letter-spacing for impact
- Documentation surfaces use a 3-column layout: left sidebar nav, center prose body, right table-of-contents
- Black promo banners (`colors.primary`) above the nav for time-bound brand moments

For this app, use the documentation family only. Do not paint plan cards as vibrant product gradients. Keep coral, magenta, blue, and purple as tokens, unused on the plan page.

### Document-first plan page

The plan page reads as one document, not a stack of cards ([ADR 0039](docs/architecture/decisions/0039-document-first-page.md)). Six rules:

- **D1 · Flow.** One column of prose. Top-level blocks are separated by space. A phase and a question for the person also get a hairline above them.
- **D2 · Cards.** A card is only for a block whose content has its own format: code, diffs, diagrams, charts, tables, file trees, API contracts, schemas, JSON, and status updates. See *Card policy* under Layout.
- **D3 · Labels.** A small uppercase eyebrow names a block's kind (`RISK`, `NEEDS YOUR CHOICE`, `DONE WHEN`). The title or prompt under it is the heading.
- **D4 · State.** State is shape plus color, with one glyph set everywhere (`StatusIcon`): an empty ring is pending, a progress ring is active, a check disc is done, a ban is blocked, and an × is failed. Phases, checklist lines, and the editor's status picker use the same glyphs. Counts read `3/6` next to a segmented bar.
- **D5 · Code words.** Paths, symbols, and line ranges are mono. A file change carries a tag (NEW, MODIFY, DELETE, RENAME). A line reference is a cite chip (`L42–58`).
- **D6 · Editable in place.** There is no edit mode. Every block opens its own editor where it sits, from its Edit pill, and + adds a block below it. Done keeps the change on the page; Apply changes makes the version. A block is read-only only when it carries `locked`, or is an answer card (form, questions) that has not set `locked="false"`.
- **D7 · Room.** No two blocks touch. A block after a block gets `--space-md` (a card after a card in a phase) or `--flow-gap` (at the top level); a heading after a data block starts a new part with `--space-xl`. Only endpoints in a row join into one card, on purpose.

## Colors

### Brand & Accent
- **Brand Coral** (`colors.brand-coral`): `#ff502e`. Editorial emphasis only, such as a 2px left rule. Not a button fill. The older `#ff5a36` does not appear on the measured site.
- **Brand Magenta** (`colors.brand-magenta`): `#e83e8c`.
- **Brand Blue** (`colors.brand-blue`): `#2563eb`.
- **Focus Blue** (`colors.focus-blue`): `#0094fc`. Product focus rings and accent borders. Article links stay brand blue.
- **Brand Blue 700** (`colors.brand-blue-700`): `#1e40af`. Documentation tag and reference text.
- **Brand Cyan** (`colors.brand-cyan`): `#67e8f9`.
- **Brand Blue 200** (`colors.brand-blue-200`): `#dbeafe`. Code badges, info-tag backgrounds.
- **Brand Purple** (`colors.brand-purple`): `#7c3aed`.

### Surface
- **Canvas White** (`colors.canvas`): `#ffffff`. Primary page background.
- **Surface** (`colors.surface`): `#f5f5f5`. Card background, distinct from the canvas. Subtle section backgrounds, search-pill rest, sidebar-nav active state.
- **Surface Soft** (`colors.surface-soft`): `#fafafa`. Quieter section divisions.
- **Hairline** (`colors.hairline`): `#e9e9e9`. 1px input border and primary divider. Solid form of black at about 9% on white.
- **Hairline Soft** (`colors.hairline-soft`): `#f0f0f1`. Quieter table-row divider.
- **Hairline Strong** (`colors.hairline-strong`): `#d4d4d8`. Outline (secondary) button border. Hover `#a1a1aa`. Never use ink for a button border: it reads as a heavy black ring in light mode and a white ring in dark mode.

### Text
- **Ink** (`colors.ink`): `#181e25`. Primary headline and prose. The body reset before that class is `#18181b`.
- **Ink Strong** (`colors.ink-strong`): `#000000`.
- **Charcoal** (`colors.charcoal`): `#27272a`. Body text.
- **Slate** (`colors.slate`): `#3f3f46`. Secondary text, metadata.
- **Steel** (`colors.steel`): `#666666`. Secondary and tertiary text, table headers, sidebar inactive items.
- **Stone** (`colors.stone`): `#a1a1aa`. Muted captions and tab inactive labels.
- **Muted** (`colors.muted`): `#a1a1aa`. Footer link text.

### Semantic
- **Success Background** (`colors.success-bg`): `#dcfce7`.
- **Success Text** (`colors.success-text`): `#166534`.
- **Error** (`colors.error`): `#ef4d3e`. Error text on light labels is `#c9322a` on `#fff4f0`.
- **Success** (`colors.success`): `#04b54b`. Success text `#0a7a38` on `#dcf5e2`.
- **Primary** (`colors.primary`): `#171717`. Near-black pill buttons. Hover `#242424`. Active `#000000`.
- **On primary** (`colors.on-primary`): `#ffffff`.
- **On dark** (`colors.on-dark`): `#ffffff`.
- **Footer bg** (`colors.footer-bg`): `#171717`.

### Status and change tags

Tints for change tags, method and status badges, health, and status glyphs. Each pair is a background and its text. Every pair has a dark value; the text keeps 4.5:1 on its tint in both themes.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--tag-add-bg` / `--tag-add-fg` | `#dcf5e2` / `#0a7a38` | `#0f2e1b` / `#4ade80` | NEW, GET, 2xx, On track |
| `--tag-mod-bg` / `--tag-mod-fg` | `#fff3d6` / `#8a5300` | `#33270a` / `#f5c451` | MODIFY, PUT and PATCH, 4xx, At risk, PK, note markers |
| `--tag-del-bg` / `--tag-del-fg` | `#fff4f0` / `#c9322a` | `#3a1612` / `#ff8a7a` | DELETE, the DELETE method, 5xx, Off track |
| `--tag-info-bg` / `--tag-info-fg` | `#dbeafe` / `#1e40af` | `#12294a` / `#a8cdff` | RENAME, POST, 3xx, cite and FK chips |
| `--tag-purple-fg` | `#6d3fd6` | `#a98bff` | JSON booleans |
| `--rule-note` · `--rule-tip` · `--rule-risk` · `--rule-warning` · `--rule-decision` | `#a1a1aa` · `#0a7a38` · `#c9322a` · `#c98a00` · `#0094fc` | `#6e6e6e` · `#4ade80` · `#ff8a7a` · `#f2c94c` · `#0094fc` | A callout's left rule and eyebrow |
| `--status-active` · `--status-blocked` | `#0094fc` · `#c98a00` | `#0094fc` · `#f2c94c` | Active and blocked glyphs and bar segments |
| `--data-head-bg` | `var(--surface)` | `#222222` | A data card's header strip, kept apart from the canvas in dark mode |
| `--mark` | `#fff1b8` | `#4a3d0a` | Marked lines and passages |

Dark document, measured on the product theme (`data-product-color-mode=dark`), not an inversion of the light page:
- Canvas `#171717`, surface `#1c1c1c`, elevated `#262626`, hairline `#2c2c2c`, hairline strong `#4a4a4a` (hover `#666666`), ink `#ededed`, secondary text `#949494`.
- The primary pill inverts: `#ffffff` fill, `#171717` label, same 36px height. Links and focus use `#0094fc`.

## Typography

**DM Sans** for product UI and articles. Fallbacks: Helvetica Neue, Helvetica, Arial. Outfit is the marketing display face and stays off plan and account screens. No italic. Emphasis is weight 500/600/700. Code uses JetBrains Mono.

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| hero-display | 80px | 600 | 1.10 | -2px | Homepage hero |
| display-lg | 56px | 600 | 1.10 | -1.5px | Section openers |
| heading-lg | 40px | 600 | 1.20 | -1px | Sub-page headlines |
| heading-md | 32px | 600 | 1.25 | -0.5px | Subsection headers |
| heading-sm | 24px | 600 | 1.30 | 0 | Card titles, feature headers |
| card-title | 20px | 600 | 1.40 | 0 | Product-card titles |
| subtitle | 18px | 500 | 1.50 | 0 | Section subtitles |
| body-md | 16px | 400 | 1.50 | 0 | Primary body |
| body-md-bold | 16px | 700 | 1.50 | 0 | Body emphasis |
| body-sm | 14px | 400 | 1.50 | 0 | Secondary body, table cells, navigation |
| body-sm-medium | 14px | 500 | 1.50 | 0 | Active sidebar nav, button labels |
| caption | 13px | 400 | 1.70 | 0 | Captions |
| caption-bold | 13px | 600 | 1.50 | 0 | Badge labels |
| micro | 12px | 400 | 1.50 | 0 | Chip labels |
| button-md | 14px | 500 | 1 | 0 | Pill button labels |
| eyebrow | 12px | 600 | 1.40 | 0.08em, uppercase | Block kind labels, data card captions, the plan header |

Plan titles use heading-sm or card-title, not hero-display. Body uses body-md.

## Layout

- Base unit 4px. Tokens: xxs 4, xs 8, sm 12, md 16, lg 20, xl 24, xxl 32, xxxl 40, section-sm 48, section 64, section-lg 80, hero 96.
- Documentation cards pad 16px (`space-md`). A card nested inside another card pads 12px (`space-sm`). Entries sit 16px apart. A row gaps 12px (`space-sm`). The page column is 720px by default, 1120px when wide, or the available width when full. Cards and prose use that column. A pipe table wraps cell text between words and keeps inline code on one line. It scrolls sideways only when its columns still do not fit. A data-table cell, column, or whole table can wrap, or wrap inside a percentage of the table. Data-table cells without that stay on one line and still scroll.
- No blueprint grid. No noise overlay.
- Flow (`--flow-gap`): 24px between top-level blocks. 32px, a hairline, and 24px of padding above a phase and above a choice, form, questions block, or approval.

### Card policy

| Block | Card | Treatment |
|---|---|---|
| phase | No | Hairline above, a 28px step circle that carries the status, 20px title, body aligned to the title |
| callout | No | 2px left rule in the kind's color, eyebrow `KIND · TITLE`, no fill |
| checklist | No | Eyebrow title, `n/m` count pill, segmented bar, rows split by soft hairlines |
| choice, form, questions, approve | No | Eyebrow kind, prompt heading, controls. Choice options are controls, so each keeps a hairline frame |
| Tabs, Compare, Properties | No | Layout only |
| Markdown table, DataTable | Yes | Hairline frame, surface header row |
| code, diff, AnnotatedCode | Yes | Data card |
| Mermaid, workflow, BarChart, LineChart | Yes | Data card |
| FileTree, Endpoint, DataModel, JsonView | Yes | Data card |
| Update | Yes | Canvas card with a health pill, no header strip |
| `Box surface="panel"` | Yes | The author asked for a panel |

A **data card** has a hairline frame, a 12px radius (`--data-card-radius`), a surface header strip with the title and its counts, and a canvas body. A **panel** (surface fill, 16px radius) stays for `<Box surface="panel">` and editor chrome. A card never sits inside another card.

## Elevation

Flat by default. Hairline border, no shadow, on documentation cards. Level 2 shadow `rgba(0,0,0,0.08) 0px 4px 6px` only on popovers and dropdowns. Level 4 `rgba(36,36,36,0.08) 0px 12px 16px -4px` on modals.

## Shapes

| Token | Value | Use |
|---|---|---|
| rounded.xs | 4px | Code chips |
| rounded.sm | 6px | Compact controls |
| rounded.md | 8px | Inputs |
| rounded.lg | 12px | Data cards, choice option rows, recommendation tiles |
| rounded.xl | 16px | Documentation cards |
| rounded.xxl | 20px | Larger panels |
| rounded.xxxl | 24px | Feature tiles |
| rounded.hero | 32px | Not used on the plan page |
| rounded.full | 9999px | Buttons, pill tabs, badges |

## Components to apply

- **button-primary**: `#171717` pill, white text, 36px height, 14px medium, full pill. Hover `#242424`. Active `#000000`. On a dark canvas the fill inverts to white and the label to `#171717`.
- **button-secondary** (outline): transparent pill, ink text, 1px `hairline-strong` gray border (`#d4d4d8` light, `#4a4a4a` dark), 36px height. Hover fills with surface and steps the border to `hairline-strong-hover` (`#a1a1aa` light, `#666666` dark). The border stays gray in both themes, never ink or white.
- **button-accent** (Approve, Comment on, Send): `--accent-fill` pill with `--on-accent` label. Hover `--accent-fill-hover`, active `--accent-fill-active`. `src/theme.ts` derives all three from the accent. The label is white or a deep accent-tinted ink, whichever contrasts more, and each state stays at least 4.5:1. The default `#0094fc` takes the `#1b2b37` label in both themes. Never put `--paper` or a fixed white on an accent fill.
- **button-tertiary**: canvas fill, hairline border, 36px height, pill.
- **button-danger**: `#fff4f0` fill, `#c9322a` text, `#ef4d3e` border, 36px height, pill.
- **button-ghost**: transparent pill, no border, ink icon or label, 36px height. Hover mixes 6% ink into the background. An icon-only ghost is a 36px circle; an icon with a chevron keeps the pill and horizontal padding.
- **card-base**: a panel uses surface (`#f5f5f5`) so it is visibly different from the white page. 16px radius, 16px padding, 1px hairline. On the plan page only `<Box surface="panel">` and editor chrome use it; prose blocks have no card (see Card policy).
- **data-card**: hairline frame, 12px radius, surface header strip (40px, 13.5px, title in ink 600 plus steel counts), canvas body. Rows inside split by `hairline-soft`.
- **eyebrow**: the eyebrow type token in steel. A callout's eyebrow takes its rule color.
- **count-pill**: 22px tall, `hairline-strong` outline, mono 11.5px, `done/total`. Beside a segmented bar of 4px segments with 3px gaps, one per item, colored by the item's state.
- **change-tag**: mono 10.5px 600, 18px tall, 4px radius, on the tag tint. Text is NEW, MODIFY, DELETE, RENAME; a screen reader hears Added, Modified, Deleted, Renamed.
- **cite-chip**: mono 11px on `--tag-info-bg`, for line ranges and foreign keys.
- **health-pill**: 24px pill with a trend glyph: On track, At risk, Off track.
- **fact-chip**: 28px outline pill with a bold number, for the plan header (`Phase 2 of 6`, `1/6 phases done`, `3 open questions`).
- **block-tools**: 26px outline pill split in two, a pencil with *Edit* and a +, beside a block's first line while the pointer or focus is on it (a tap on a touch screen) and the plan can be edited. Never shown on a locked block, in comment mode, or in print.
- **block-editor**: the block's editor in its place, framed by a 1px accent border with a 3px soft accent ring and the 16px radius. Its bar (hint, Remove in danger text, Cancel, Done) sticks to the bottom of the window on a tall block. The empty line with the caret shows *Type / to add a block* in muted text; the + bars never do.
- **apply-bar**: sticky at the bottom of the plan column while changes are not applied: canvas, hairline-strong border, shadow, 16px radius. A count (`2 changes not applied`), a muted note, a ghost Discard, and a primary *Apply changes*. After the agent writes, the note reads *The agent updated the plan. Your changes are kept on top of it.* When changes overlap, the title is `N of your changes overlap the agent's`, and a list under the bar (hairline top border, scrolls past 32vh) has one row per block: its name in ink 600, `in <phase>` and `Yours: …` in steel, and two secondary pills, *Keep mine* and *Keep the agent's*. Apply stays disabled until every row is chosen. Below 1000px the bar sits above the corner buttons.
- **add-block**: full-width dashed hairline button, muted *+ Add a block*, after the plan's last block.
- **text-input**: canvas fill, hairline border, 8px radius, 36px height. Focus ring is 2px `#0094fc` and appears on `:focus-visible` with no delay.
- **badge-success**, **badge-new**, **badge-beta** as specified, pill shaped.
- Tabs: underline segmented tabs or black pill tabs. Plan/Workflow/Settings can be pill tabs.

## Do

- The near-black pill is the primary action. One primary button per form.
- Brand coral stays off body text, off plan cards, and off standard buttons.
- Pill buttons only. Icons inside a button are 16px, `currentColor`, and decorative unless they are the only label.
- DM Sans on product UI, JetBrains Mono for code. Outfit stays on marketing titles.
- Keep prose blocks flat. Give a card only to data with its own format.
- Show state with shape and color together, and give every tag and glyph a text name for screen readers.
- Let a wide tree, table, or code block scroll inside its own card, never the page.

## Don't

- Don't use the blueprint background.
- Don't make cards the same color as the page.
- Don't put gradient backgrounds on standard buttons or plan cards.
- Don't introduce a second display typeface.
- Don't use heavy shadows on cards.
- Don't nest a card inside a card.
- Don't wrap a phase, callout, checklist, choice, form, questions block, or approval in a card.
- Don't put a fill behind a callout. Its rule and eyebrow carry the kind.
