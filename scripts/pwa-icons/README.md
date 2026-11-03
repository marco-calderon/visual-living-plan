# PWA icons

`npm run icons` regenerates `public/icons/` with [`@vite-pwa/assets-generator`](https://vite-pwa-org.netlify.app/assets-generator/).

| File | Source | Used by |
|---|---|---|
| `favicon.ico` (48px), `pwa-16x16.png`, `pwa-32x32.png` | `src/favicon.png` | Browser tabs, `/favicon.ico` |
| `pwa-64x64.png`, `pwa-192x192.png`, `pwa-512x512.png` | `src/favicon.png` | Manifest `any`: Chrome, Edge, Windows, macOS, ChromeOS, Android splash |
| `maskable-icon-192x192.png`, `maskable-icon-512x512.png` | `mark.png` on white | Manifest `maskable`: Android adaptive launcher icons |
| `apple-touch-icon-180x180.png` | `mark.png` on white | iOS and iPadOS home screen |

`mark.png` is the mark from `src/favicon.png`, cropped to its edges on a transparent background. If the logo changes, update both.
