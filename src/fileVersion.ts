export type FileVersionSnapshot = {
  id: string
  seq: number
}

/** Current file version. Snapshots are display-only; the head sequence is the marker. */
export function fileVersionSeq(snapshots: readonly FileVersionSnapshot[], headId: string | null): number {
  if (headId) {
    const head = snapshots.find((snapshot) => snapshot.id === headId)
    if (head && head.seq > 0) return head.seq
  }
  let latest = 0
  for (const snapshot of snapshots) {
    if (snapshot.seq > latest) latest = snapshot.seq
  }
  return latest > 0 ? latest : 1
}

export function fileVersionText(seq: number): string {
  return `v${seq}`
}

export function fileVersionName(seq: number): string {
  return `Version · ${fileVersionText(seq)}`
}
