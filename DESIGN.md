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

## Colors

### Brand & Accent
- **Brand Coral** (`colors.brand-coral`): `#ff5a36`. Signature high-impact accent.
- **Brand Magenta** (`colors.brand-magenta`): `#e83e8c`.
- **Brand Blue** (`colors.brand-blue`): `#2563eb`.
- **Brand Blue Deep** (`colors.brand-blue-deep`): `#1d4ed8`. Form-control activation, link emphasis.
- **Brand Blue 700** (`colors.brand-blue-700`): `#1e40af`. Documentation tag and reference text.
- **Brand Cyan** (`colors.brand-cyan`): `#67e8f9`.
- **Brand Blue 200** (`colors.brand-blue-200`): `#dbeafe`. Code badges, info-tag backgrounds.
- **Brand Purple** (`colors.brand-purple`): `#7c3aed`.

### Surface
- **Canvas White** (`colors.canvas`): `#ffffff`. Primary page background.
- **Surface** (`colors.surface`): `#f4f4f5`. Card background, distinct from the canvas. Subtle section backgrounds, search-pill rest, sidebar-nav active state.
- **Surface Soft** (`colors.surface-soft`): `#fafafa`. Quieter section divisions.
- **Hairline** (`colors.hairline`): `#e4e4e7`. 1px input border and primary divider.
- **Hairline Soft** (`colors.hairline-soft`): `#f0f0f1`. Quieter table-row divider.

### Text
- **Ink** (`colors.ink`): `#18181b`. Primary headline and CTA text.
- **Ink Strong** (`colors.ink-strong`): `#000000`.
- **Charcoal** (`colors.charcoal`): `#27272a`. Body text.
- **Slate** (`colors.slate`): `#3f3f46`. Secondary text, metadata.
- **Steel** (`colors.steel`): `#71717a`. Tertiary text, table headers, sidebar inactive items.
- **Stone** (`colors.stone`): `#a1a1aa`. Muted captions and tab inactive labels.
- **Muted** (`colors.muted`): `#a1a1aa`. Footer link text.

### Semantic
- **Success Background** (`colors.success-bg`): `#dcfce7`.
- **Success Text** (`colors.success-text`): `#166534`.
- Error border: `#d45656`.
- **Primary** (`colors.primary`): `#09090b`. Black pill buttons.
- **On primary** (`colors.on-primary`): `#ffffff`.
- **On dark** (`colors.on-dark`): `#ffffff`.
- **Footer bg** (`colors.footer-bg`): `#09090b`.

Dark document (derived; the source pages have no dark palette):
- Canvas `#0c0c0e`, surface `#18181b` (cards lighter than the page), hairline `#27272a`, ink `#fafafa`, charcoal `#e4e4e7`, steel `#a1a1aa`.

## Typography

**DM Sans** (primary). Fallbacks: Inter, Helvetica Neue, Helvetica, Arial. No italic. Emphasis is weight 500/600/700. Code uses a system monospace.

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
| button-md | 14px | 600 | 1.40 | 0 | Pill button labels |

Plan titles use heading-sm or card-title, not hero-display. Body uses body-md.

## Layout

- Base unit 4px. Tokens: xxs 4, xs 8, sm 12, md 16, lg 20, xl 24, xxl 32, xxxl 40, section-sm 48, section 64, section-lg 80, hero 96.
- Documentation cards pad 16px (`space-md`). A card nested inside another card pads 12px (`space-sm`). Entries sit 16px apart. A row gaps 12px (`space-sm`). The page column is 720px by default, 1120px when wide, or the available width when full. Cards and prose use that column. A table scrolls sideways when its columns do not fit. A data-table cell can wrap, or wrap inside a percentage of the table. Cells without that stay on one line and still scroll.
- No blueprint grid. No noise overlay.

## Elevation

Flat by default. Hairline border, no shadow, on documentation cards. Level 2 shadow `rgba(0,0,0,0.08) 0px 4px 6px` only on popovers and dropdowns. Level 4 `rgba(36,36,36,0.08) 0px 12px 16px -4px` on modals.

## Shapes

| Token | Value | Use |
|---|---|---|
| rounded.xs | 4px | Code chips |
| rounded.sm | 6px | Compact controls |
| rounded.md | 8px | Inputs |
| rounded.lg | 12px | Recommendation tiles |
| rounded.xl | 16px | Documentation cards |
| rounded.xxl | 20px | Larger panels |
| rounded.xxxl | 24px | Feature tiles |
| rounded.hero | 32px | Not used on the plan page |
| rounded.full | 9999px | Buttons, pill tabs, badges |

## Components to apply

- **button-primary**: black pill, white text, 8px 12px, rounded-full.
- **button-secondary**: transparent, ink text, 1px ink border, 8px 12px, pill.
- **button-tertiary**: canvas fill, hairline border, 8px 12px, pill.
- **button-danger**: danger-soft fill, danger text, danger border, 8px 12px, pill.
- **card-base**: canvas was the spec for white cards; this app uses surface (`#f4f4f5`) so the card is visibly different from the white page. 16px radius, 16px padding, 1px hairline. Nested cards pad 12px.
- **text-input**: canvas fill, hairline border, 8px radius, 40px height. Focus: 2px brand-blue-deep.
- **badge-success**, **badge-new**, **badge-beta** as specified, pill shaped.
- Tabs: underline segmented tabs or black pill tabs. Plan/Workflow/Settings can be pill tabs.

## Do

- Black pill is the primary action.
- Brand colors stay off body text and off plan cards.
- Pill buttons only.
- DM Sans only, plus monospace for code.

## Don't

- Don't use the blueprint background.
- Don't make cards the same color as the page.
- Don't put gradient backgrounds on standard buttons or plan cards.
- Don't introduce a second display typeface.
- Don't use heavy shadows on cards.
