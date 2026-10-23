import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

if (!process.env.LIVE_PLAN_LOG_HOME) {
  process.env.LIVE_PLAN_LOG_HOME = mkdtempSync(join(tmpdir(), 'live-plan-log-home-'))
}
