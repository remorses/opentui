// Client exports (for browser)
export { connectTerminal, type ConnectOptions, type TerminalConnection } from "./client/connect"
export { TerminalRenderer, type TerminalRendererOptions } from "./client/html-renderer"

// Shared types
export type {
  VTermData,
  VTermLine,
  VTermSpan,
  ClientMessage,
  ServerMessage,
  LineDiff,
  Modifiers,
} from "./shared/types"
