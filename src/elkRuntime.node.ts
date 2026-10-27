import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ELK from 'elkjs/lib/elk-api.js'
import type { ElkNode } from 'elkjs'

type ElkFakeWorker = {
  dispatcher: { saveDispatch: (event: { data: unknown }) => void }
  onmessage: ((event: { data: unknown }) => void) | null
  postMessage?: (message: unknown) => void
  terminate?: () => void
}

type FakeWorkerConstructor = new () => ElkFakeWorker

/**
 * Bun (and some other runtimes) define global `self`, so elk-worker's UMD build
 * thinks it is inside a Web Worker and never exports FakeWorker. Evaluate the
 * file with `self` unset so we get the in-process worker, matching Node.
 */
function loadFakeWorker(): FakeWorkerConstructor {
  const require = createRequire(import.meta.url)
  const workerPath = require.resolve('elkjs/lib/elk-worker.min.js')
  const code = readFileSync(workerPath, 'utf8')
  const module = { exports: {} as { Worker?: FakeWorkerConstructor; default?: FakeWorkerConstructor } }
  const run = new Function('module', 'exports', 'self', 'document', 'window', code) as (
    module: { exports: unknown },
    exports: unknown,
    self: undefined,
    document: undefined,
    window: undefined,
  ) => void
  run(module, module.exports, undefined, undefined, undefined)
  const FakeWorker = module.exports.Worker ?? module.exports.default
  if (!FakeWorker) throw new Error('ELK FakeWorker failed to load')
  return FakeWorker
}

const FakeWorker = loadFakeWorker()
const elk = new ELK({
  workerFactory: () => new FakeWorker() as unknown as Worker,
})
await elk.knownLayoutAlgorithms()

function elkFakeWorker(): ElkFakeWorker {
  return (elk as unknown as { worker: { worker: ElkFakeWorker } }).worker.worker
}

/**
 * ELK's public layout() is always async (setTimeout). After the algorithms are
 * registered, the embedded fake worker can run layout through its dispatcher
 * synchronously so plan bootstrap and tests keep a sync API.
 */
export function layoutElkGraph(graph: ElkNode): ElkNode {
  const worker = elkFakeWorker()
  let data: ElkNode | undefined
  let errorMessage: string | undefined
  const previous = worker.onmessage
  worker.onmessage = (event) => {
    const payload = event.data as { data?: ElkNode; error?: { message?: string } }
    data = payload.data
    errorMessage = payload.error?.message
  }
  try {
    worker.dispatcher.saveDispatch({
      data: {
        id: 1,
        cmd: 'layout',
        graph,
        layoutOptions: {},
        options: { logging: false, measureExecutionTime: false },
      },
    })
  } finally {
    worker.onmessage = previous
  }
  if (errorMessage) throw new Error(errorMessage)
  if (!data) throw new Error('ELK layout produced no graph')
  return data
}
