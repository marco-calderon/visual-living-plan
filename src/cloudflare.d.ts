declare module 'cloudflare:workers' {
  export const env: import('./host/app.ts').HostEnv
}
