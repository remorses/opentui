import type { VTermData, VTermLine, VTermSpan } from "@opentui/core"

export type { VTermData, VTermLine, VTermSpan }

export interface Modifiers {
  shift?: boolean
  ctrl?: boolean
  alt?: boolean
  meta?: boolean
}

// Client -> Server messages
export type ClientMessage =
  | { type: "key"; key: string; modifiers?: Modifiers }
  | { type: "mouse"; action: "down" | "up" | "move" | "scroll"; x: number; y: number; button?: number }
  | { type: "resize"; cols: number; rows: number }
  | { type: "ping" }

// Server -> Client messages
export type ServerMessage =
  | { type: "full"; data: VTermData }
  | { type: "diff"; changes: LineDiff[] }
  | { type: "cursor"; x: number; y: number; visible: boolean }
  | { type: "pong" }
  | { type: "error"; message: string }

export interface LineDiff {
  index: number
  line: VTermLine
}

export interface SessionInfo {
  id: string
  cols: number
  rows: number
}
