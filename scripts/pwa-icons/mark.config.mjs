// Full-bleed icons: the mark on white. Maskable padding keeps the mark inside
// Android's 80% safe circle. iOS needs an opaque icon.
/** @type {import('@vite-pwa/assets-generator/config').UserConfig} */
export default {
  preset: {
    transparent: { sizes: [], favicons: [] },
    maskable: {
      sizes: [192, 512],
      padding: 0.45,
      resizeOptions: { background: '#ffffff', fit: 'contain' },
    },
    apple: {
      sizes: [180],
      padding: 0.3,
      resizeOptions: { background: '#ffffff', fit: 'contain' },
    },
  },
  images: ['work/mark/logo.png'],
}
