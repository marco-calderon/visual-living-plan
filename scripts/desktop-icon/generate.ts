#!/usr/bin/env bun
/**
 * The desktop app icon, drawn like a macOS app icon (`bun run desktop:icons`).
 *
 * Apple's icon grid: a 1024px canvas, an 824px rounded-square body centered with 100px around it
 * for the shadow, and the continuous corner macOS uses (a superellipse). The body is a white
 * gradient, and the Cycle mark from `scripts/pwa-icons/logo.svg` sits in its middle.
 *
 * Writes `scripts/desktop-icon/icon.svg`, renders it at 1024px with Playwright's Chromium, and
 * runs `tauri icon` to produce the `.icns` and the PNGs in `src-tauri/icons/`.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const here = join(root, 'scripts/desktop-icon')
const iconsDir = join(root, 'src-tauri/icons')

const CANVAS = 1024
const BODY = 824
/** Apple's continuous corner is close to a superellipse of this exponent. */
const CORNER_EXPONENT = 5
/** Width of the mark as a share of the body. */
const MARK_SHARE = 0.56
/** The logo's 36px strokes, a little heavier so the mark holds up at 16 and 32px. */
const MARK_STROKE = 46

/** The outline of the icon body, centered on the canvas. */
export function squirclePath(size = BODY, canvas = CANVAS, exponent = CORNER_EXPONENT, steps = 360): string {
  const half = size / 2
  const center = canvas / 2
  const points: string[] = []
  for (let step = 0; step < steps; step += 1) {
    const angle = (step / steps) * Math.PI * 2
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const x = center + half * Math.sign(cos) * Math.abs(cos) ** (2 / exponent)
    const y = center + half * Math.sign(sin) * Math.abs(sin) ** (2 / exponent)
    points.push(`${x.toFixed(2)} ${y.toFixed(2)}`)
  }
  return `M ${points.join(' L ')} Z`
}

/** The Cycle mark's shapes from the logo, without its own canvas offset. */
function markShapes(): string {
  const logo = readFileSync(join(root, 'scripts/pwa-icons/logo.svg'), 'utf8')
  const inner = logo.match(/<g transform="translate\(0 18\)">([\s\S]*)<\/g><\/svg>/)?.[1]
  if (!inner) throw new Error('scripts/pwa-icons/logo.svg no longer has the expected mark group')
  return inner.replaceAll('#000', '#171717').replace('stroke-width="36"', `stroke-width="${MARK_STROKE}"`)
}

function iconSvg(markTransform: string): string {
  const body = squirclePath()
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
  <defs>
    <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#ebebeb"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#000000" flood-opacity="0.28"/>
    </filter>
  </defs>
  <path d="${body}" fill="url(#body)" filter="url(#shadow)"/>
  <path d="${body}" fill="none" stroke="#000000" stroke-opacity="0.06" stroke-width="2"/>
  <g id="mark" transform="${markTransform}">${markShapes()}</g>
</svg>
`
}

async function main(): Promise<void> {
  const browser = await chromium.launch()
  const work = mkdtempSync(join(tmpdir(), 'living-plan-icon-'))
  try {
    const page = await browser.newPage({ viewport: { width: CANVAS, height: CANVAS } })
    await page.setContent(`<body style="margin:0;background:transparent">${iconSvg('')}</body>`)
    // Center the mark on its drawn bounds, at MARK_SHARE of the body width.
    const transform = await page.evaluate(
      ({ canvas, width }) => {
        const mark = document.getElementById('mark') as unknown as SVGGraphicsElement
        const box = mark.getBBox()
        const scale = width / box.width
        const x = canvas / 2 - (box.x + box.width / 2) * scale
        const y = canvas / 2 - (box.y + box.height / 2) * scale
        return `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(4)})`
      },
      { canvas: CANVAS, width: BODY * MARK_SHARE },
    )
    const svg = iconSvg(transform)
    writeFileSync(join(here, 'icon.svg'), svg)
    await page.setContent(`<body style="margin:0;background:transparent">${svg}</body>`)
    const png = join(work, 'icon-1024.png')
    await page.locator('svg').screenshot({ path: png, omitBackground: true })

    const tauri = spawnSync(process.execPath, ['x', 'tauri', 'icon', png, '--output', iconsDir], {
      cwd: root,
      stdio: 'inherit',
    })
    if (tauri.status !== 0) throw new Error('tauri icon failed')
    // The app ships for macOS: keep the .icns and the PNGs tauri.conf.json lists.
    for (const extra of ['android', 'ios', 'icon.ico', '64x64.png']) rmSync(join(iconsDir, extra), { recursive: true, force: true })
    for (const name of spawnSync('ls', [iconsDir], { encoding: 'utf8' }).stdout.split('\n')) {
      if (/^(Square\d+x\d+Logo|StoreLogo)\.png$/.test(name)) rmSync(join(iconsDir, name))
    }
    console.log('desktop:icons: wrote scripts/desktop-icon/icon.svg and src-tauri/icons/')
  } finally {
    await browser.close()
    rmSync(work, { recursive: true, force: true })
  }
}

if (import.meta.main) await main()
