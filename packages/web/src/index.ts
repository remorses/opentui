// Server exports
export { serve, type ServeOptions, type WebServer } from "./server/serve"
export { opentuiWebSocket, type OpentuiWebSocketOptions } from "./server/websocket"
export { type Session } from "./server/session"

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

// Shared session core (for tunnel package)
export { SessionCore, type SessionCoreOptions } from "./shared/session-core"

// WebSocket abstraction
export { 
  type WebSocketLike, 
  WebSocketState,
  ServerWebSocketAdapter,
  ClientWebSocketAdapter,
} from "./shared/websocket"

// Utilities
export { diffLines, applyDiff } from "./shared/span-differ"
