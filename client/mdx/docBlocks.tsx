import {
  ArrowRight,
  ChevronRight,
  Database,
  File as FileIcon,
  Folder,
  FolderOpen,
  KeyRound,
  Link2,
  Lock,
  Minus,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import {
  Children,
  Fragment,
  isValidElement,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react'
import { collectText } from './textChildren'
import './docBlocks.css'

/*
 * Document blocks (ADR 0039): data views that sit inside the plan's prose. They are MDX components
 * like DataTable, not plan entries: no events, no id, no workflow step. A parent reads its rows'
 * props (a FileTree reads each File), so a row renders nothing on its own.
 */

const LazyCodeBlock = lazy(() => import('../CodeBlock.tsx').then((module) => ({ default: module.CodeBlock })))

const ROW = Symbol.for('visual-living-plan.doc-row')

type Marked = { [ROW]?: string }

function markRow<T>(component: T, kind: string): T {
  ;(component as Marked)[ROW] = kind
  return component
}

function rowKindOf(type: unknown): string | undefined {
  if (type === null || (typeof type !== 'function' && typeof type !== 'object')) return undefined
  const kind = (type as Marked)[ROW]
  return typeof kind === 'string' ? kind : undefined
}

function isBlank(node: ReactNode): boolean {
  return node == null || typeof node === 'boolean' || (typeof node === 'string' && node.trim() === '')
}

/**
 * Split a parent's children into its rows, by kind, and everything else. MDX wraps rows written on
 * one line in a paragraph, so a paragraph that holds only rows is looked through.
 */
export function splitRows(children: ReactNode, kinds: readonly string[]): { rows: Record<string, ReactElement[]>; all: ReactElement[]; rest: ReactNode[] } {
  const rows: Record<string, ReactElement[]> = Object.fromEntries(kinds.map((kind) => [kind, []]))
  const all: ReactElement[] = []
  const rest: ReactNode[] = []
  const take = (child: ReactNode): boolean => {
    if (!isValidElement(child)) return false
    const kind = rowKindOf(child.type)
    if (!kind || !kinds.includes(kind)) return false
    rows[kind]?.push(child)
    all.push(child)
    return true
  }
  Children.forEach(children, (child) => {
    if (isBlank(child)) return
    if (take(child)) return
    if (isValidElement<{ children?: ReactNode }>(child) && child.type === 'p') {
      const inner = Children.toArray(child.props.children).filter((node) => !isBlank(node))
      if (inner.length > 0 && inner.every((node) => isValidElement(node) && kinds.includes(rowKindOf(node.type) ?? ''))) {
        inner.forEach(take)
        return
      }
    }
    rest.push(child)
  })
  return { rows, all, rest }
}

/** `locked` on a block (ADR 0039): no Edit pill on the page, kept as written in the editor. */
function lockAttr(value: unknown): 'true' | undefined {
  return flag(value) ? 'true' : undefined
}

/** A boolean attribute: bare (`pk`), `"true"`, or `{true}`. */
export function flag(value: unknown): boolean {
  return value === true || value === '' || value === 'true'
}

function text(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

/** A row's body as inline content: one paragraph is unwrapped so the note sits on the row's line. */
function inline(children: ReactNode): ReactNode {
  const nodes = Children.toArray(children).filter((node) => !isBlank(node))
  if (nodes.length === 1) {
    const only = nodes[0]
    if (isValidElement<{ children?: ReactNode }>(only) && only.type === 'p') return only.props.children
  }
  return nodes.length > 0 ? nodes : null
}

export type Change = 'added' | 'modified' | 'deleted' | 'renamed' | 'unchanged'

const CHANGE_ALIASES: Record<string, Change> = {
  added: 'added',
  add: 'added',
  new: 'added',
  created: 'added',
  modified: 'modified',
  modify: 'modified',
  changed: 'modified',
  change: 'modified',
  edit: 'modified',
  edited: 'modified',
  updated: 'modified',
  deleted: 'deleted',
  delete: 'deleted',
  removed: 'deleted',
  remove: 'deleted',
  renamed: 'renamed',
  rename: 'renamed',
  moved: 'renamed',
  move: 'renamed',
  unchanged: 'unchanged',
  none: 'unchanged',
  context: 'unchanged',
}

/** The kind of change a file, entity, or endpoint has. Undefined when the attribute is missing or unknown. */
export function changeKind(value: unknown): Change | undefined {
  const key = text(value).toLowerCase()
  return key ? CHANGE_ALIASES[key] : undefined
}

const CHANGE_TAG: Record<Exclude<Change, 'unchanged'>, { tag: string; name: string }> = {
  added: { tag: 'NEW', name: 'Added' },
  modified: { tag: 'MODIFY', name: 'Modified' },
  deleted: { tag: 'DELETE', name: 'Deleted' },
  renamed: { tag: 'RENAME', name: 'Renamed' },
}

/** NEW, MODIFY, DELETE, or RENAME. The full word is what a screen reader hears. */
export function ChangeTag({ change }: { change?: Change }) {
  if (!change || change === 'unchanged') return null
  const { tag, name } = CHANGE_TAG[change]
  return (
    <span className="plan-change-tag" data-change={change} title={name}>
      <span aria-hidden="true">{tag}</span>
      <span className="plan-sr">{name}</span>
    </span>
  )
}

function DataHead({ icon, title, meta, end }: { icon?: ReactNode; title?: ReactNode; meta?: ReactNode; end?: ReactNode }) {
  return (
    <div className="plan-data-head">
      {icon ? <span className="plan-data-icon" aria-hidden="true">{icon}</span> : null}
      {title ? <span className="plan-data-title">{title}</span> : null}
      {meta ? <span className="plan-data-meta">{meta}</span> : null}
      {end ? <span className="plan-data-end">{end}</span> : null}
    </div>
  )
}

/* ------------------------------------------------------------------ File tree */

export type FileProps = { path?: string; change?: string; from?: string; children?: ReactNode }

type Leaf = { kind: 'file'; name: string; path: string; change: Change; from?: string; note: ReactNode; key: string }
type Dir = { kind: 'dir'; name: string; path: string; dirs: Map<string, Dir>; files: Leaf[] }

function newDir(name: string, path: string): Dir {
  return { kind: 'dir', name, path, dirs: new Map(), files: [] }
}

/** Folders from the files' paths. A file without a change is shown as modified, the usual case in a plan. */
export function buildFileTree(files: Array<{ path: string; change?: Change; from?: string; note?: ReactNode }>): Dir {
  const root = newDir('', '')
  files.forEach((file, index) => {
    const parts = file.path.split('/').filter(Boolean)
    const name = parts.pop()
    if (!name) return
    let dir = root
    for (const part of parts) {
      const path = dir.path ? `${dir.path}/${part}` : part
      let next = dir.dirs.get(part)
      if (!next) {
        next = newDir(part, path)
        dir.dirs.set(part, next)
      }
      dir = next
    }
    dir.files.push({
      kind: 'file',
      name,
      path: file.path,
      change: file.change ?? 'modified',
      from: file.from,
      note: file.note ?? null,
      key: `${file.path}#${index}`,
    })
  })
  return compactDir(root, true)
}

/** `src` holding only `gateway` reads as one row, `src/gateway`. */
function compactDir(dir: Dir, isRoot = false): Dir {
  const dirs = new Map<string, Dir>()
  for (const [key, child] of dir.dirs) dirs.set(key, compactDir(child))
  let node: Dir = { ...dir, dirs }
  while (!isRoot && node.files.length === 0 && node.dirs.size === 1) {
    const only = [...node.dirs.values()][0]
    if (!only) break
    node = { ...only, name: `${node.name}/${only.name}` }
  }
  return node
}

type TreeRow = { depth: number; node: Dir | Leaf }

function flattenTree(dir: Dir, collapsed: ReadonlySet<string>, depth = 0, out: TreeRow[] = []): TreeRow[] {
  const dirs = [...dir.dirs.values()].sort((a, b) => a.name.localeCompare(b.name))
  const files = [...dir.files].sort((a, b) => a.name.localeCompare(b.name))
  for (const child of dirs) {
    out.push({ depth, node: child })
    if (!collapsed.has(child.path)) flattenTree(child, collapsed, depth + 1, out)
  }
  for (const file of files) out.push({ depth, node: file })
  return out
}

function countChanges(rows: Array<{ change?: Change }>): Record<Change, number> {
  const counts: Record<Change, number> = { added: 0, modified: 0, deleted: 0, renamed: 0, unchanged: 0 }
  for (const row of rows) counts[row.change ?? 'modified'] += 1
  return counts
}

function ChangeSums({ counts }: { counts: Record<Change, number> }) {
  const parts: Array<{ change: Change; sign: string; name: string }> = [
    { change: 'added', sign: '+', name: 'added' },
    { change: 'modified', sign: '~', name: 'modified' },
    { change: 'deleted', sign: '−', name: 'deleted' },
    { change: 'renamed', sign: '→', name: 'renamed' },
  ]
  const shown = parts.filter((part) => counts[part.change] > 0)
  if (shown.length === 0) return null
  const label = shown.map((part) => `${counts[part.change]} ${part.name}`).join(', ')
  return (
    <span className="plan-change-sums" role="img" aria-label={label} title={label}>
      {shown.map((part) => (
        <span key={part.change} data-change={part.change}>
          {part.sign}
          {counts[part.change]}
        </span>
      ))}
    </span>
  )
}

function FileRowView({ path, change }: FileProps) {
  return <Path change={change}>{path}</Path>
}

/** One file in a FileTree. On its own, it reads as a path. */
export const File = markRow(FileRowView, 'file')

export function FileTree({ title, locked, children }: { title?: string; locked?: unknown; children?: ReactNode }) {
  const { rows, rest } = splitRows(children, ['file'])
  const files = (rows.file ?? []).flatMap((element) => {
    const props = element.props as FileProps
    const path = text(props.path)
    if (!path) return []
    return [{ path, change: changeKind(props.change), from: text(props.from) || undefined, note: inline(props.children) }]
  })
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const tree = buildFileTree(files)
  const list = flattenTree(tree, collapsed)
  const counts = countChanges(files.map((file) => ({ change: file.change ?? 'modified' })))
  const toggle = (path: string) =>
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  return (
    <section className="plan-doc-card plan-file-tree" data-doc-block="FileTree" data-edit-locked={lockAttr(locked)}>
      <DataHead
        icon={<Folder size={14} />}
        title={text(title) || 'Files'}
        meta={`${files.length} ${files.length === 1 ? 'file' : 'files'}`}
        end={<ChangeSums counts={counts} />}
      />
      {rest.length > 0 ? <div className="plan-doc-card-note plan-rich">{rest}</div> : null}
      <ul className="plan-tree">
        {list.map(({ depth, node }) =>
          node.kind === 'dir' ? (
            <li key={`dir:${node.path}`} className="plan-tree-row" data-kind="dir" style={{ '--depth': depth } as CSSProperties}>
              <button
                type="button"
                className="plan-tree-toggle"
                aria-expanded={!collapsed.has(node.path)}
                onClick={() => toggle(node.path)}
              >
                <ChevronRight className="plan-tree-chev" size={14} aria-hidden="true" />
                {collapsed.has(node.path) ? (
                  <Folder className="plan-tree-icon" size={15} aria-hidden="true" />
                ) : (
                  <FolderOpen className="plan-tree-icon" size={15} aria-hidden="true" />
                )}
                <span className="plan-tree-name">{node.name}</span>
              </button>
            </li>
          ) : (
            <li
              key={node.key}
              className="plan-tree-row"
              data-kind="file"
              data-change={node.change}
              style={{ '--depth': depth } as CSSProperties}
            >
              <span className="plan-tree-chev-space" aria-hidden="true" />
              <FileIcon className="plan-tree-icon" size={15} aria-hidden="true" />
              <span className="plan-tree-name" title={node.path}>
                {node.name}
              </span>
              <ChangeTag change={node.change} />
              {node.from || node.note ? (
                <span className="plan-tree-note">
                  {node.from ? <span className="plan-tree-from">← {node.from}</span> : null}
                  {node.from && node.note ? ' · ' : null}
                  {node.note}
                </span>
              ) : null}
            </li>
          ),
        )}
      </ul>
    </section>
  )
}

/* ------------------------------------------------------------------ Endpoint */

export type ParamProps = { name?: string; in?: string; type?: string; required?: unknown; children?: ReactNode }
export type ResponseProps = { status?: string | number; children?: ReactNode }

export const Param = markRow(function Param(_props: ParamProps) {
  return null
}, 'param')
export const EndpointRequest = markRow(function Request(_props: { children?: ReactNode }) {
  return null
}, 'request')
export const EndpointResponse = markRow(function Response(_props: ResponseProps) {
  return null
}, 'response')

const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options'])

function statusClass(status: string): string {
  const first = status.trim().charAt(0)
  return ['1', '2', '3', '4', '5'].includes(first) ? `${first}xx` : 'other'
}

export function Endpoint({
  method,
  path,
  change,
  auth,
  summary,
  open,
  locked,
  children,
}: {
  method?: string
  path?: string
  change?: string
  auth?: string
  summary?: string
  open?: unknown
  locked?: unknown
  children?: ReactNode
}) {
  const { rows, rest } = splitRows(children, ['param', 'request', 'response'])
  const verb = text(method).toUpperCase() || 'GET'
  const known = METHODS.has(verb.toLowerCase()) ? verb.toLowerCase() : 'other'
  const ownSummary = text(summary)
  const summaryText = ownSummary || collectText(rest[0] ?? '').replace(/\s+/g, ' ').trim()
  const details = ownSummary ? rest : rest.slice(1)
  const params = rows.param ?? []
  const requests = rows.request ?? []
  const responses = rows.response ?? []
  const authText = text(auth)
  return (
    <details className="plan-doc-card plan-endpoint" data-doc-block="Endpoint" open={flag(open) || undefined} data-edit-locked={lockAttr(locked)}>
      <summary className="plan-endpoint-summary">
        <ChevronRight className="plan-endpoint-chev" size={14} aria-hidden="true" />
        <span className="plan-method" data-method={known}>
          {verb}
        </span>
        <span className="plan-endpoint-path">{text(path) || '/'}</span>
        <ChangeTag change={changeKind(change)} />
        {summaryText ? <span className="plan-endpoint-sum">{summaryText}</span> : null}
        {authText ? (
          <span className="plan-endpoint-auth" title={`Needs ${authText}`}>
            <Lock size={13} aria-hidden="true" />
            <span className="plan-sr">Needs {authText}</span>
          </span>
        ) : null}
      </summary>
      <div className="plan-endpoint-body">
        {details.length > 0 ? <div className="plan-rich">{details}</div> : null}
        {authText ? (
          <p className="plan-endpoint-line">
            <span className="plan-eyebrow">Auth</span> {authText}
          </p>
        ) : null}
        {params.length > 0 ? (
          <div className="plan-doc-scroll">
            <table className="plan-param-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">In</th>
                  <th scope="col">Type</th>
                  <th scope="col">Description</th>
                </tr>
              </thead>
              <tbody>
                {params.map((element, index) => {
                  const props = element.props as ParamProps
                  return (
                    <tr key={`${text(props.name)}-${index}`}>
                      <td>
                        <span className="plan-mono">{text(props.name)}</span>
                        {flag(props.required) ? (
                          <span className="plan-required" title="Required">
                            <span aria-hidden="true"> *</span>
                            <span className="plan-sr"> (required)</span>
                          </span>
                        ) : null}
                      </td>
                      <td>{text(props.in)}</td>
                      <td>
                        <span className="plan-mono plan-muted-mono">{text(props.type)}</span>
                      </td>
                      <td>{inline(props.children)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        {requests.map((element, index) => (
          <div key={`request-${index}`} className="plan-endpoint-part">
            <div className="plan-eyebrow">Request</div>
            <div className="plan-rich">{(element.props as { children?: ReactNode }).children}</div>
          </div>
        ))}
        {responses.length > 0 ? (
          <div className="plan-endpoint-part">
            <div className="plan-eyebrow">Responses</div>
            <ul className="plan-response-list">
              {responses.map((element, index) => {
                const props = element.props as ResponseProps
                const status = text(props.status) || '200'
                return (
                  <li key={`${status}-${index}`}>
                    <span className="plan-status-code" data-class={statusClass(status)}>
                      {status}
                    </span>
                    <div className="plan-rich">{inline(props.children)}</div>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </details>
  )
}

/* ------------------------------------------------------------------ Data model */

export type EntityProps = { name?: string; change?: string; collapsed?: unknown; children?: ReactNode }
export type AttrProps = {
  name?: string
  type?: string
  pk?: unknown
  fk?: string
  nullable?: unknown
  change?: string
  children?: ReactNode
}
export type RelationProps = { from?: string; to?: string; kind?: string; children?: ReactNode }

export const Entity = markRow(function Entity(_props: EntityProps) {
  return null
}, 'entity')
export const Attr = markRow(function Attr(_props: AttrProps) {
  return null
}, 'attr')
export const Relation = markRow(function Relation(_props: RelationProps) {
  return null
}, 'relation')

/** `1-n` reads as `1:n`. */
export function relationKind(value: unknown): string {
  const raw = text(value).toLowerCase()
  if (!raw) return '→'
  return raw.replace(/\s+/g, '').replace(/[-_]/g, ':')
}

function EntityView({ entity }: { entity: ReactElement }) {
  const props = entity.props as EntityProps
  const { rows, rest } = splitRows(props.children, ['attr'])
  const attrs = rows.attr ?? []
  const change = changeKind(props.change)
  return (
    <details className="plan-entity" open={!flag(props.collapsed) || undefined} data-change={change}>
      <summary className="plan-entity-summary">
        <ChevronRight className="plan-endpoint-chev" size={14} aria-hidden="true" />
        <Database className="plan-entity-icon" size={14} aria-hidden="true" />
        <span className="plan-entity-name">{text(props.name) || 'entity'}</span>
        <ChangeTag change={change} />
        <span className="plan-data-meta plan-entity-count">
          {attrs.length} {attrs.length === 1 ? 'field' : 'fields'}
        </span>
      </summary>
      {rest.length > 0 ? <div className="plan-entity-note plan-rich">{rest}</div> : null}
      <ul className="plan-attrs">
        {attrs.map((element, index) => {
          const attr = element.props as AttrProps
          const pk = flag(attr.pk)
          const fk = text(attr.fk)
          const note = inline(attr.children)
          return (
            <li key={`${text(attr.name)}-${index}`} className="plan-attr" data-change={changeKind(attr.change)}>
              <span className="plan-attr-key" aria-hidden="true">
                {pk ? <KeyRound size={13} /> : fk ? <Link2 size={13} /> : null}
              </span>
              <span className="plan-attr-name">{text(attr.name)}</span>
              <span className="plan-attr-type">
                {text(attr.type)}
                {flag(attr.nullable) ? <span className="plan-attr-null"> · null</span> : null}
              </span>
              <span className="plan-attr-badges">
                <ChangeTag change={changeKind(attr.change)} />
                {pk ? <span className="plan-key-chip">PK</span> : null}
                {fk ? <span className="plan-cite">FK {fk}</span> : null}
              </span>
              {note ? <span className="plan-attr-note">{note}</span> : null}
            </li>
          )
        })}
      </ul>
    </details>
  )
}

export function DataModel({ title, locked, children }: { title?: string; locked?: unknown; children?: ReactNode }) {
  const { rows, rest } = splitRows(children, ['entity', 'relation'])
  const entities = rows.entity ?? []
  const relations = rows.relation ?? []
  return (
    <section className="plan-doc-card plan-data-model" data-doc-block="DataModel" data-edit-locked={lockAttr(locked)}>
      <DataHead
        icon={<Database size={14} />}
        title={text(title) || 'Data model'}
        meta={`${entities.length} ${entities.length === 1 ? 'table' : 'tables'}`}
      />
      {rest.length > 0 ? <div className="plan-doc-card-note plan-rich">{rest}</div> : null}
      {entities.map((entity, index) => (
        <EntityView key={`${text((entity.props as EntityProps).name)}-${index}`} entity={entity} />
      ))}
      {relations.length > 0 ? (
        <div className="plan-relations">
          <span className="plan-eyebrow">Relations</span>
          <ul>
            {relations.map((element, index) => {
              const relation = element.props as RelationProps
              const note = inline(relation.children)
              return (
                <li key={`${text(relation.from)}-${text(relation.to)}-${index}`}>
                  <span className="plan-mono">{text(relation.from)}</span>
                  <span className="plan-cite">
                    {relationKind(relation.kind)} <ArrowRight size={11} aria-hidden="true" />
                  </span>
                  <span className="plan-mono">{text(relation.to)}</span>
                  {note ? <span className="plan-relation-note">{note}</span> : null}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

/* ------------------------------------------------------------------ JSON */

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

function jsonSize(value: Json): string {
  if (Array.isArray(value)) return `${value.length} ${value.length === 1 ? 'item' : 'items'}`
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).length
    return `${keys} ${keys === 1 ? 'key' : 'keys'}`
  }
  return ''
}

function JsonScalar({ value }: { value: Json }) {
  if (value === null) return <span className="plan-json-null">null</span>
  if (typeof value === 'string') return <span className="plan-json-string">{JSON.stringify(value)}</span>
  if (typeof value === 'number') return <span className="plan-json-number">{String(value)}</span>
  return <span className="plan-json-bool">{String(value)}</span>
}

function JsonNode({ name, value, level, depth, last }: { name?: string; value: Json; level: number; depth: number; last: boolean }) {
  const branch = value !== null && typeof value === 'object'
  const [open, setOpen] = useState(level < depth)
  const comma = last ? '' : ','
  const key = name !== undefined ? (
    <>
      <span className="plan-json-key">{JSON.stringify(name)}</span>
      <span className="plan-json-punct">: </span>
    </>
  ) : null
  if (!branch) {
    return (
      <div className="plan-json-line" style={{ '--level': level } as CSSProperties}>
        <span className="plan-json-toggle-space" />
        {key}
        <JsonScalar value={value} />
        <span className="plan-json-punct">{comma}</span>
      </div>
    )
  }
  const isArray = Array.isArray(value)
  const entries: Array<[string | undefined, Json]> = isArray
    ? (value as Json[]).map((item) => [undefined, item])
    : Object.entries(value as Record<string, Json>)
  const [openMark, closeMark] = isArray ? ['[', ']'] : ['{', '}']
  const label = name !== undefined ? name : isArray ? 'array' : 'object'
  if (entries.length === 0) {
    return (
      <div className="plan-json-line" style={{ '--level': level } as CSSProperties}>
        <span className="plan-json-toggle-space" />
        {key}
        <span className="plan-json-punct">
          {openMark}
          {closeMark}
          {comma}
        </span>
      </div>
    )
  }
  return (
    <>
      <div className="plan-json-line" style={{ '--level': level } as CSSProperties}>
        <button
          type="button"
          className="plan-json-toggle"
          aria-expanded={open}
          aria-label={`${open ? 'Fold' : 'Unfold'} ${label}`}
          onClick={() => setOpen(!open)}
        >
          <ChevronRight size={12} aria-hidden="true" />
        </button>
        {key}
        <span className="plan-json-punct">{openMark}</span>
        {open ? null : (
          <>
            <span className="plan-json-fold">… {jsonSize(value)}</span>
            <span className="plan-json-punct">
              {closeMark}
              {comma}
            </span>
          </>
        )}
      </div>
      {open
        ? entries.map(([childName, child], index) => (
            <JsonNode
              key={childName ?? index}
              name={childName}
              value={child}
              level={level + 1}
              depth={depth}
              last={index === entries.length - 1}
            />
          ))
        : null}
      {open ? (
        <div className="plan-json-line" style={{ '--level': level } as CSSProperties}>
          <span className="plan-json-toggle-space" />
          <span className="plan-json-punct">
            {closeMark}
            {comma}
          </span>
        </div>
      ) : null}
    </>
  )
}

/** Parse the fence's JSON. A parse error comes back as its message. */
export function readJson(source: string): { ok: true; value: Json } | { ok: false; message: string } {
  try {
    return { ok: true, value: JSON.parse(source) as Json }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Not valid JSON' }
  }
}

export function JsonView({ title, depth, locked, children }: { title?: string; depth?: string | number; locked?: unknown; children?: ReactNode }) {
  const source = collectText(children).trim()
  const parsed = readJson(source)
  const levels = Number(depth)
  const openTo = Number.isFinite(levels) && levels >= 0 ? levels : 2
  return (
    <section className="plan-doc-card plan-json" data-doc-block="JsonView" data-edit-locked={lockAttr(locked)}>
      <DataHead title={text(title) || undefined} meta="JSON" />
      {parsed.ok ? (
        <div className="plan-json-tree">
          <JsonNode value={parsed.value} level={0} depth={openTo} last />
        </div>
      ) : (
        <div className="plan-json-invalid">
          {children}
          <p className="plan-json-error" role="note">
            Could not read this JSON: {parsed.message}
          </p>
        </div>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ Annotated code */

export type NoteProps = { lines?: string | number; label?: string; children?: ReactNode }

export const Note = markRow(function Note(_props: NoteProps) {
  return null
}, 'note')

/** `42` or `42-44` (also `42–44`). Null when it is not a line range. */
export function lineRange(value: unknown): { start: number; end: number } | null {
  const match = /^\s*(\d+)\s*(?:[-–—:]\s*(\d+))?\s*$/.exec(text(value))
  if (!match) return null
  const start = Number(match[1])
  const end = match[2] ? Number(match[2]) : start
  if (!Number.isInteger(start) || start < 1 || end < start) return null
  return { start, end }
}

function fenceOf(nodes: ReactNode[]): { code: string; language: string; index: number } | null {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]
    if (!isValidElement<{ children?: ReactNode }>(node)) continue
    const inner = Children.toArray(node.props.children).find((child) => isValidElement(child))
    if (!isValidElement<{ className?: string; children?: ReactNode }>(inner)) continue
    if (inner.type !== 'code') continue
    const language = /language-([\w+-]+)/.exec(inner.props.className ?? '')?.[1] ?? ''
    return { code: collectText(inner.props.children).replace(/\n$/, ''), language, index }
  }
  return null
}

export function AnnotatedCode({ title, start, locked, children }: { title?: string; start?: string | number; locked?: unknown; children?: ReactNode }) {
  const { rows, rest } = splitRows(children, ['note'])
  const notes = rows.note ?? []
  const fence = fenceOf(rest)
  const first = Number(start)
  const startLine = Number.isInteger(first) && first >= 1 ? first : 1
  const lineCount = fence ? fence.code.split('\n').length : 0
  const marks = notes.map((element, index) => {
    const props = element.props as NoteProps
    return { number: index + 1, range: lineRange(props.lines), label: text(props.label), body: inline(props.children) }
  })
  // The marked lines, in the fence's own numbering (1 is its first line). The notes list below says what each mark means.
  const highlightLines = [
    ...new Set(
      marks.flatMap((mark) => {
        if (!mark.range) return []
        const lines: number[] = []
        for (let line = mark.range.start; line <= mark.range.end; line += 1) {
          const index = line - startLine + 1
          if (index >= 1 && index <= lineCount) lines.push(index)
        }
        return lines
      }),
    ),
  ]
  const others = fence ? rest.filter((_, index) => index !== fence.index) : rest
  return (
    <section className="plan-doc-card plan-annotated" data-doc-block="AnnotatedCode" data-edit-locked={lockAttr(locked)}>
      {text(title) ? <DataHead title={<span className="plan-mono">{text(title)}</span>} /> : null}
      {fence ? (
        <div className="code-host plan-annotated-code" data-react-code="" data-source={fence.code}>
          <Suspense
            fallback={
              <pre className="code-block" data-react-code="">
                <code>{fence.code}</code>
              </pre>
            }
          >
            <LazyCodeBlock code={fence.code} language={fence.language} startingLineNumber={startLine} highlightLines={highlightLines} />
          </Suspense>
        </div>
      ) : null}
      {others.length > 0 ? <div className="plan-doc-card-note plan-rich">{others}</div> : null}
      {marks.length > 0 ? (
        <ol className="plan-note-list">
          {marks.map((mark) => (
            <li key={mark.number}>
              <span className="plan-note-mark" aria-hidden="true">
                {mark.number}
              </span>
              {mark.range ? (
                <span className="plan-cite">
                  L{mark.range.start}
                  {mark.range.end !== mark.range.start ? `–${mark.range.end}` : ''}
                </span>
              ) : (
                <span />
              )}
              <span className="plan-note-text">
                {mark.label ? <b>{mark.label}.</b> : null}
                {mark.label && mark.body ? ' ' : null}
                {mark.body}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  )
}

/* ------------------------------------------------------------------ Tabs */

export type TabProps = { label?: string; children?: ReactNode }

export const Tab = markRow(function Tab({ children }: TabProps) {
  return <>{children}</>
}, 'tab')

export function Tabs({ label, locked, children }: { label?: string; locked?: unknown; children?: ReactNode }) {
  const { rows } = splitRows(children, ['tab'])
  const tabs = rows.tab ?? []
  const [selected, setSelected] = useState(0)
  const base = useId()
  const buttons = useRef<Array<HTMLButtonElement | null>>([])
  const current = Math.min(selected, Math.max(tabs.length - 1, 0))
  const choose = useCallback((index: number, focus: boolean) => {
    setSelected(index)
    if (focus) buttons.current[index]?.focus()
  }, [])
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = tabs.length - 1
    let next: number | null = null
    if (event.key === 'ArrowRight') next = current >= last ? 0 : current + 1
    else if (event.key === 'ArrowLeft') next = current <= 0 ? last : current - 1
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = last
    if (next === null) return
    event.preventDefault()
    choose(next, true)
  }
  // A search or a link that finds text in a hidden tab shows that tab.
  const panels = useRef<Array<HTMLDivElement | null>>([])
  useEffect(() => {
    const cleanups = panels.current.slice(0, tabs.length).map((node, index) => {
      if (!node) return () => {}
      const reveal = () => setSelected(index)
      node.addEventListener('beforematch', reveal)
      return () => node.removeEventListener('beforematch', reveal)
    })
    return () => cleanups.forEach((cleanup) => cleanup())
  }, [tabs.length])
  // React writes `hidden` as a plain flag. `until-found` keeps a hidden panel searchable, so it is set here.
  useLayoutEffect(() => {
    panels.current.slice(0, tabs.length).forEach((node, index) => {
      if (!node) return
      if (index === current) node.removeAttribute('hidden')
      else node.setAttribute('hidden', 'until-found')
    })
  }, [current, tabs.length])
  if (tabs.length === 0) return null
  return (
    <div className="plan-tabs" data-doc-block="Tabs" data-edit-locked={lockAttr(locked)}>
      <div className="plan-tablist" role="tablist" aria-label={text(label) || undefined} onKeyDown={onKeyDown}>
        {tabs.map((tab, index) => {
          const props = tab.props as TabProps
          return (
            <button
              key={`tab-${index}`}
              ref={(node) => {
                buttons.current[index] = node
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${index}`}
              aria-selected={index === current}
              aria-controls={`${base}-panel-${index}`}
              tabIndex={index === current ? 0 : -1}
              className="plan-tab"
              onClick={() => choose(index, false)}
            >
              {text(props.label) || `Tab ${index + 1}`}
            </button>
          )
        })}
      </div>
      {tabs.map((tab, index) => (
        <div
          key={`panel-${index}`}
          ref={(node) => {
            panels.current[index] = node
          }}
          role="tabpanel"
          id={`${base}-panel-${index}`}
          aria-labelledby={`${base}-tab-${index}`}
          className="plan-tabpanel plan-rich"
          tabIndex={0}
          data-tab-state={index === current ? 'selected' : 'hidden'}
        >
          {(tab.props as TabProps).children}
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ Compare */

export type PaneProps = { label?: string; children?: ReactNode }

export const Pane = markRow(function Pane({ children }: PaneProps) {
  return <>{children}</>
}, 'pane')

export function Compare({ locked, children }: { locked?: unknown; children?: ReactNode }) {
  const { rows } = splitRows(children, ['pane'])
  const panes = rows.pane ?? []
  return (
    <div className="plan-compare" data-doc-block="Compare" data-panes={Math.min(panes.length, 3)} data-edit-locked={lockAttr(locked)}>
      {panes.map((pane, index) => {
        const props = pane.props as PaneProps
        return (
          <section key={`pane-${index}`} className="plan-compare-pane">
            {text(props.label) ? <div className="plan-eyebrow">{text(props.label)}</div> : null}
            <div className="plan-rich">{props.children}</div>
          </section>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ Update */

export type Health = 'on-track' | 'at-risk' | 'off-track'

export function healthOf(value: unknown): Health | undefined {
  const key = text(value).toLowerCase().replace(/[\s_]+/g, '-')
  if (['on-track', 'ontrack', 'green', 'good'].includes(key)) return 'on-track'
  if (['at-risk', 'atrisk', 'yellow', 'risk'].includes(key)) return 'at-risk'
  if (['off-track', 'offtrack', 'red', 'blocked'].includes(key)) return 'off-track'
  return undefined
}

const HEALTH_LABEL: Record<Health, string> = { 'on-track': 'On track', 'at-risk': 'At risk', 'off-track': 'Off track' }

/** "2h ago" for a date in the past, or null when the text is not a date. */
export function relativeTime(value: string, now: number = Date.now()): string | null {
  if (!/\d{4}-\d{2}-\d{2}/.test(value)) return null
  const time = Date.parse(value)
  if (!Number.isFinite(time)) return null
  const seconds = Math.round((now - time) / 1000)
  if (seconds < 0) return null
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

export function Update({ health, by, date, locked, children }: { health?: string; by?: string; date?: string; locked?: unknown; children?: ReactNode }) {
  const level = healthOf(health)
  const when = text(date)
  const ago = when ? relativeTime(when) : null
  const Icon = level === 'off-track' ? TrendingDown : level === 'at-risk' ? Minus : TrendingUp
  return (
    <section className="plan-doc-card plan-update" data-doc-block="Update" data-health={level} data-edit-locked={lockAttr(locked)}>
      <div className="plan-update-meta">
        {level ? (
          <span className="plan-health" data-health={level}>
            <Icon size={13} aria-hidden="true" />
            {HEALTH_LABEL[level]}
          </span>
        ) : null}
        {text(by) ? <span className="plan-update-by">{text(by)}</span> : null}
        {when ? (
          <time className="plan-update-date" dateTime={/\d{4}-\d{2}-\d{2}/.test(when) ? when : undefined}>
            {when}
            {ago ? ` · ${ago}` : ''}
          </time>
        ) : null}
      </div>
      <div className="plan-rich">{children}</div>
    </section>
  )
}

/* ------------------------------------------------------------------ Properties */

export type PropProps = { label?: string; children?: ReactNode }

export const Prop = markRow(function Prop({ children }: PropProps) {
  return <>{children}</>
}, 'prop')

export function Properties({ locked, children }: { locked?: unknown; children?: ReactNode }) {
  const { rows } = splitRows(children, ['prop'])
  const props = rows.prop ?? []
  return (
    <dl className="plan-properties" data-doc-block="Properties" data-edit-locked={lockAttr(locked)}>
      {props.map((element, index) => {
        const prop = element.props as PropProps
        return (
          <Fragment key={`prop-${index}`}>
            <dt>{text(prop.label)}</dt>
            <dd>{inline(prop.children)}</dd>
          </Fragment>
        )
      })}
    </dl>
  )
}

/* ------------------------------------------------------------------ Path */

export function Path({ path, change, lines, children }: { path?: string; change?: string; lines?: string | number; children?: ReactNode }) {
  const name = text(path) || collectText(children).trim()
  const range = lineRange(lines)
  return (
    <span className="plan-path" data-doc-block="Path">
      <ChangeTag change={changeKind(change)} />
      <span className="plan-path-name">{name}</span>
      {range ? (
        <span className="plan-cite">
          L{range.start}
          {range.end !== range.start ? `–${range.end}` : ''}
        </span>
      ) : null}
    </span>
  )
}

/** The document blocks by their tag in a plan. */
export const docBlockComponents = {
  FileTree,
  File,
  Endpoint,
  Param,
  Request: EndpointRequest,
  Response: EndpointResponse,
  DataModel,
  Entity,
  Attr,
  Relation,
  JsonView,
  AnnotatedCode,
  Note,
  Tabs,
  Tab,
  Compare,
  Pane,
  Update,
  Properties,
  Prop,
  Path,
}

/** Tag names of the document blocks, for the outline and the editor. */
export const DOC_BLOCK_NAMES = Object.keys(docBlockComponents)
