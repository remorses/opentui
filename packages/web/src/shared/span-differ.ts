import type { VTermLine, VTermSpan, LineDiff } from "./types"

function spansEqual(a: VTermSpan, b: VTermSpan): boolean {
  return a.text === b.text && a.fg === b.fg && a.bg === b.bg && a.flags === b.flags && a.width === b.width
}

function linesEqual(a: VTermLine | undefined, b: VTermLine | undefined): boolean {
  if (!a || !b) return a === b
  if (a.spans.length !== b.spans.length) return false
  for (let i = 0; i < a.spans.length; i++) {
    if (!spansEqual(a.spans[i], b.spans[i])) return false
  }
  return true
}

export function diffLines(prev: VTermLine[], next: VTermLine[]): LineDiff[] {
  const changes: LineDiff[] = []
  const maxLen = Math.max(prev.length, next.length)

  for (let i = 0; i < maxLen; i++) {
    if (!linesEqual(prev[i], next[i])) {
      changes.push({
        index: i,
        line: next[i] || { spans: [] },
      })
    }
  }

  return changes
}

export function applyDiff(lines: VTermLine[], changes: LineDiff[]): VTermLine[] {
  const result = [...lines]
  for (const { index, line } of changes) {
    result[index] = line
  }
  return result
}
