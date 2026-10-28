import { readFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compile, run } from '@mdx-js/mdx'
import { createElement, type ComponentType } from 'react'
import * as runtime from 'react/jsx-runtime'
import { createMdxComponents, type MdxComponentMap } from './componentMap.ts'
import { recmaPlanComponents } from './recmaPlanComponents.ts'
import { remarkMermaid } from './remarkMermaid.ts'

const spikeDirectory = fileURLToPath(new URL('./', import.meta.url))

export type ShippedMdxProps = {
  components?: MdxComponentMap
}

/**
 * Compile one `.mdx` file that ships in this folder into a React component.
 * Callers cannot pass a source string. `@mdx-js/mdx` `run` executes only that
 * compiled file, with the React JSX runtime — not an arbitrary script.
 */
export async function compileShippedMdx(relativePath: string): Promise<ComponentType<ShippedMdxProps>> {
  const file = shippedMdxPath(relativePath)
  const source = await readFile(file, 'utf8')
  const compiled = await compile(
    { path: file, value: source },
    {
      jsx: false,
      jsxImportSource: 'react',
      jsxRuntime: 'automatic',
      outputFormat: 'function-body',
      format: 'mdx',
      development: false,
      remarkPlugins: [remarkMermaid],
      recmaPlugins: [recmaPlanComponents],
    },
  )
  const loaded = await run(String(compiled), {
    ...runtime,
    baseUrl: pathToFileURL(file).href,
  })
  return loaded.default as ComponentType<ShippedMdxProps>
}

export async function loadSamplePlan(): Promise<ComponentType> {
  const Content = await compileShippedMdx('sample-plan.mdx')
  const components = await createMdxComponents()
  return function SamplePlan() {
    return createElement(Content, { components })
  }
}

function shippedMdxPath(relativePath: string): string {
  if (typeof relativePath !== 'string' || relativePath.includes('\0') || relativePath.includes('\n')) {
    throw new Error('MDX compile only accepts a file shipped in this spike folder')
  }
  if (relativePath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(relativePath)) {
    throw new Error('MDX compile only accepts a file shipped in this spike folder')
  }
  const file = resolve(spikeDirectory, relativePath)
  const fromSpike = relative(spikeDirectory, file)
  if (fromSpike === '' || fromSpike.startsWith('..') || fromSpike.split(sep).includes('..')) {
    throw new Error('MDX compile only accepts a file shipped in this spike folder')
  }
  if (!file.endsWith('.mdx')) {
    throw new Error('MDX compile only accepts .mdx files shipped in this spike folder')
  }
  return file
}
