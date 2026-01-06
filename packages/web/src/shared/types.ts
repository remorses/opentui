import type { VTermData, VTermLine, VTermSpan } from "@opentui/core"

export type { VTermData, VTermLine, VTermSpan }

export interface Modifiers {
  shift?: boolean
  ctrl?: boolean
  meta?: boolean // Alt/Option key (browser altKey)
  super?: boolean // Cmd/Windows key (browser metaKey)
  hyper?: boolean
}

// Client -> Server messages
export type ClientMessage =
  | { type: "key"; key: string; modifiers?: Modifiers }
  | { type: "mouse"; action: "down" | "up" | "move"; x: number; y: number; button?: number }
  | { type: "scroll"; x: number; y: number; lines: number }
  | { type: "resize"; cols: number; rows: number }
  | { type: "ping" }

// Server -> Client messages
export type ServerMessage =
  | { type: "full"; data: VTermData }
  | { type: "diff"; changes: LineDiff[] }
  | { type: "cursor"; x: number; y: number; visible: boolean }
  | { type: "selection"; anchor: { x: number; y: number }; focus: { x: number; y: number } }
  | { type: "selection-clear" }
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

// Multiplexed message types (from tunnel DO)
export type MultiplexedIncoming =
  | { id: string; data: string }
  | { id: string; event: "upstream_closed" }
  | { id: string; event: "upstream_connected" }
  | { id: string; event: "upstream_error"; error?: { message?: string; name?: string } }
  | { id: string; event: "upstream_discovered" }

export type MultiplexedOutgoing = { id: string; data: string }
