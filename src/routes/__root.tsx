import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { QueryProvider } from '../../client/queryClient.tsx'
import appCss from '../styles.css?url'
import { APPLE_TOUCH_ICON, FAVICON_16, FAVICON_32, FAVICON_ICO } from '../pwaIcons.ts'
import { THEME_COLOR_DARK, THEME_COLOR_LIGHT, WEB_MANIFEST_PATH } from '../webManifest.ts'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Living Plan' },
      { name: 'theme-color', content: THEME_COLOR_LIGHT, media: '(prefers-color-scheme: light)' },
      { name: 'theme-color', content: THEME_COLOR_DARK, media: '(prefers-color-scheme: dark)' },
    ],
    links: [
      { rel: 'manifest', href: WEB_MANIFEST_PATH },
      { rel: 'icon', type: 'image/png', href: '/favicon.png' },
      { rel: 'icon', href: FAVICON_ICO, sizes: '48x48' },
      { rel: 'icon', type: 'image/png', href: FAVICON_32, sizes: '32x32' },
      { rel: 'icon', type: 'image/png', href: FAVICON_16, sizes: '16x16' },
      { rel: 'apple-touch-icon', href: APPLE_TOUCH_ICON },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap',
      },
      { rel: 'stylesheet', href: appCss },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <QueryProvider>{children}</QueryProvider>
        <Scripts />
      </body>
    </html>
  )
}
