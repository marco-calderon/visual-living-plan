// "any" install icons and tab icons: the source logo as is (white round tile).
/** @type {import('@vite-pwa/assets-generator/config').UserConfig} */
export default {
  preset: {
    transparent: {
      sizes: [16, 32, 64, 192, 512],
      padding: 0,
      favicons: [[48, 'favicon.ico']],
    },
    maskable: { sizes: [] },
    apple: { sizes: [] },
  },
  images: ['work/tile/logo.png'],
}
