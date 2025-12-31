// Server exports
export { serve, type ServeOptions, type WebServer } from "./server/serve"
export { opentuiWebSocket, type OpentuiWebSocketOptions } from "./server/websocket"
export { type Session } from "./server/session"
export { createWebRenderer, type WebRenderer, type WebRendererOptions } from "./server/web-renderer"

// Shared types
export type {
  VTermData,
  VTermLine,
  VTermSpan,
  ClientMessage,
  ServerMessage,
  LineDiff,
  Modifiers,
  SessionInfo,
} from "./shared/types"

// Utilities
export { diffLines, applyDiff } from "./shared/span-differ"
