import { compile, type CompileOptions } from '@mdx-js/mdx'
import { recmaPlanComponents } from './recmaPlanComponents'
import { remarkGfmTable } from './remarkGfmTable'
import { remarkGfmTaskList } from './remarkGfmTaskList'
import { remarkCodeMeta } from './remarkCodeMeta'
import { remarkMermaid } from './remarkMermaid'

export function planMdxCompileOptions(): CompileOptions {
  return {
    jsx: false,
    jsxImportSource: 'react',
    jsxRuntime: 'automatic',
    outputFormat: 'function-body',
    format: 'mdx',
    development: false,
    remarkPlugins: [remarkMermaid, remarkGfmTable, remarkGfmTaskList, remarkCodeMeta],
    recmaPlugins: [recmaPlanComponents],
  }
}

export function compilePlanMdx(source: string) {
  return compile(source, planMdxCompileOptions())
}
