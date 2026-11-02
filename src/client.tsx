import { StrictMode, startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'
import { registerServiceWorker } from './registerServiceWorker.ts'

// TanStack Start serves this file as the browser entry when it exists.
// origin/main had no src/client.tsx, so the package default entry shipped.
// That default only hydrates StartClient. Registration stays here, in the entry
// the browser actually runs. The local plan bundle registers from client/main.tsx.
registerServiceWorker()

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
  )
})
