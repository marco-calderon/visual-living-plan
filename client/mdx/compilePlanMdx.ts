import { compile, type CompileOptions } from '@mdx-js/mdx'
import { recmaPlanComponents } from './recmaPlanComponents.ts'
import { remarkGfmTable } from './remarkGfmTable.ts'
import { remarkMermaid } from './remarkMermaid.ts'

export function planMdxCompileOptions(): CompileOptions {
  return {
    jsx: false,
    jsxImportSource: 'react',
    jsxRuntime: 'automatic',
    outputFormat: 'function-body',
    format: 'mdx',
    development: false,
    remarkPlugins: [remarkMermaid, remarkGfmTable],
    recmaPlugins: [recmaPlanComponents],
  }
}

export function compilePlanMdx(source: string) {
  return compile(source, planMdxCompileOptions())
}
