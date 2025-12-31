import type { ServerWebSocket } from "bun"
import { SessionManager, type Session } from "./session"
import type { ClientMessage } from "../shared/types"

export interface OpentuiWebSocketOptions {
  maxCols?: number
  maxRows?: number
  frameRate?: number
  onConnection: (session: Session) => void | (() => void)
}

interface WebSocketData {
  sessionId: string
  query: URLSearchParams
}

/**
 * Creates WebSocket handlers that can be spread into Bun.serve() options.
 *
 * @example
 * ```ts
 * import { opentuiWebSocket } from '@opentui/web'
 *
 * Bun.serve({
 *   port: 3001,
 *   static: {
 *     "/": "./index.html",
 *   },
 *   ...opentuiWebSocket({
 *     onConnection: (session) => {
 *       const root = createRoot(session.renderer)
 *       root.render(<App />)
 *       return () => root.unmount()
 *     }
 *   })
 * })
 * ```
 */
export function opentuiWebSocket(options: OpentuiWebSocketOptions) {
  const { maxCols = 200, maxRows = 60, frameRate = 50, onConnection } = options

  const sessionManager = new SessionManager({
    maxCols,
    maxRows,
    frameRate,
    onConnection,
  })

  return {
    /**
     * Fetch handler that upgrades WebSocket connections.
     * Compose with your own fetch handler if needed.
     */
    fetch(req: Request, server: { upgrade: (req: Request, options: { data: WebSocketData }) => boolean }) {
      const url = new URL(req.url)

      // Only handle /ws path for WebSocket upgrade
      if (url.pathname === "/ws") {
        const query = url.searchParams
        const upgradeHeader = req.headers.get("upgrade")

        if (upgradeHeader !== "websocket") {
          return new Response("Expected WebSocket upgrade", { status: 400 })
        }

        const upgraded = server.upgrade(req, {
          data: { sessionId: "", query },
        })

        if (upgraded) {
          return undefined
        }
        return new Response("WebSocket upgrade failed", { status: 400 })
      }

      // Return null to let other handlers process the request
      return null
    },

    websocket: {
      async open(ws: ServerWebSocket<WebSocketData>) {
        try {
          const query = ws.data.query || new URLSearchParams()
          const sessionId = await sessionManager.createSession(ws as any, query)
          ws.data.sessionId = sessionId
          Bun.write(Bun.stderr, `[opentui/web] Session ${sessionId} connected (${sessionManager.getSessionCount()} active)\n`)
        } catch (error) {
          console.error(`[opentui/web] Error creating session:`, error)
        }
      },

      message(ws: ServerWebSocket<WebSocketData>, message: string | Buffer) {
        try {
          const data = JSON.parse(String(message)) as ClientMessage
          const sessionId = ws.data.sessionId
          if (!sessionId) {
            Bun.write(Bun.stderr, `[opentui/web] Message received before session created, ignoring: ${String(message).slice(0, 100)}\n`)
            return
          }
          sessionManager.handleMessage(sessionId, data)
        } catch (error) {
          console.error("[opentui/web] Invalid message:", error)
        }
      },

      close(ws: ServerWebSocket<WebSocketData>) {
        const sessionId = ws.data.sessionId
        sessionManager.destroySession(sessionId)
        Bun.write(Bun.stderr, `[opentui/web] Session ${sessionId} disconnected (${sessionManager.getSessionCount()} active)\n`)
      },
    },

    /** Access the session manager for advanced use cases */
    sessionManager,
  }
}
