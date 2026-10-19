import { copyFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { loadClientAssets } from '../src/assets'
import { startLivingPlanServer } from '../src/server'
import type { PlanMode } from '../src/processRecord'

const port = Number(process.env.E2E_PORT ?? 9478)
const mode: PlanMode = process.env.E2E_MODE === 'review' ? 'review' : 'watch'
const planSource = resolve(process.env.E2E_PLAN ?? 'examples/rate-limit.plan.md')
const home = await mkdtemp(join(tmpdir(), 'live-plan-e2e-'))
const planPath = join(home, 'sample.plan.md')
await copyFile(planSource, planPath)

const assets = await loadClientAssets()
if (!assets?.jsHref || !assets.selectorHref) {
  console.error('Client build is missing. Run `bun run build:client` before the desktop tests.')
  process.exit(1)
}

const server = await startLivingPlanServer({
  planPath,
  mode,
  port: Number.isFinite(port) ? port : 9478,
  host: '127.0.0.1',
  iteration: mode === 'review' ? 1 : undefined,
  configPath: join(home, 'live-plan.config.json'),
})

console.log(`e2e ${mode} ${server.url}`)

async function shutdown(): Promise<void> {
  await server.close()
  process.exit(0)
}

process.on('SIGINT', () => {
  void shutdown()
})
process.on('SIGTERM', () => {
  void shutdown()
})
