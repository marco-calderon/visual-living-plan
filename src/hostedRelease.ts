/**
 * Hosted Settings: the worker has no file system, so the version and changelogs
 * are built into the app. Only the newest changelog is loaded, on demand.
 */
import { version } from '../package.json'
import { hostedReleaseFrom, type HostedRelease } from './changelogParse'

export type { HostedRelease }

const CHANGELOGS = import.meta.glob<string>('../docs/changelogs/changelog-*.md', {
  query: '?raw',
  import: 'default',
})

export function loadHostedRelease(): Promise<HostedRelease> {
  return hostedReleaseFrom(version, CHANGELOGS)
}
