# PWA icons

`npm run icons` regenerates `public/icons/` with [`@vite-pwa/assets-generator`](https://vite-pwa-org.netlify.app/assets-generator/).

| File | Source | Used by |
|---|---|---|
| `favicon.ico` (48px), `pwa-16x16.png`, `pwa-32x32.png` | `src/favicon.png` | Browser tabs, `/favicon.ico` |
| `pwa-64x64.png`, `pwa-192x192.png`, `pwa-512x512.png` | `src/favicon.png` | Manifest `any`: Chrome, Edge, Windows, macOS, ChromeOS, Android splash |
| `maskable-icon-192x192.png`, `maskable-icon-512x512.png` | `mark.png` on white | Manifest `maskable`: Android adaptive launcher icons |
| `apple-touch-icon-180x180.png` | `mark.png` on white | iOS and iPadOS home screen |

`logo.svg` is the logo's vector source: the Cycle mark on a 1024 grid, 36px strokes, filled nodes of radius 55, black on transparent. `src/favicon.png` is that mark at 1024px on a white circle the size of the canvas, and `public/favicon.png` is a copy of it. `mark.png` is the same mark cropped to its edges on a transparent background. `src/faviconBase64.ts` embeds `src/favicon.png` for builds that cannot read the file. If the logo changes, update all of them, then run `bun run icons`.
