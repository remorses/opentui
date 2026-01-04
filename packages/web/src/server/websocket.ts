import type { ServerWebSocket } from "bun"
import { SessionManager, type Session } from "./session"
import type { ClientMessage, MultiplexedIncoming, MultiplexedOutgoing } from "../shared/types"

export interface OpentuiWebSocketOptions {
  maxCols?: number
  maxRows?: number
  frameRate?: number
  onConnection: (session: Session) => void | (() => void)
}

interface WebSocketData {
  sessionId: string
  tunnelId: string
  namespace: string
  query: URLSearchParams
  pendingMessages: string[]
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
     * Handles /multiplexer endpoint with namespace and id query params.
     */
    fetch(req: Request, server: { upgrade: (req: Request, options: { data: WebSocketData }) => boolean }) {
      const url = new URL(req.url)

      // Handle /multiplexer path for WebSocket upgrade (tunnel-style)
      if (url.pathname === "/multiplexer") {
        const query = url.searchParams
        const namespace = query.get("namespace")
        const tunnelId = query.get("id")
        const upgradeHeader = req.headers.get("upgrade")

        if (upgradeHeader !== "websocket") {
          return new Response("Expected WebSocket upgrade", { status: 400 })
        }

        if (!namespace || !tunnelId) {
          return new Response("namespace and id query params required", { status: 400 })
        }

        const upgraded = server.upgrade(req, {
          data: { sessionId: "", tunnelId, namespace, query, pendingMessages: [] },
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
          const tunnelId = ws.data.tunnelId

          // Create a wrapped send function that adds {id, data} envelope
          const wrappedWs = {
            send: (message: string) => {
              const wrapped: MultiplexedOutgoing = { id: tunnelId, data: message }
              ws.send(JSON.stringify(wrapped))
            },
            close: ws.close.bind(ws),
            readyState: ws.readyState,
          }

          const sessionId = await sessionManager.createSession(wrappedWs as any, query)
          ws.data.sessionId = sessionId

          // Process any messages that arrived while session was being created
          for (const pendingMessage of ws.data.pendingMessages) {
            try {
              const data = JSON.parse(pendingMessage) as ClientMessage
              sessionManager.handleMessage(sessionId, data)
            } catch (error) {
              console.error("[opentui/web] Error processing pending message:", error)
            }
          }
          ws.data.pendingMessages = []

          Bun.write(
            Bun.stderr,
            `[opentui/web] Session ${sessionId} connected (tunnel: ${tunnelId}, ${sessionManager.getSessionCount()} active)\n`,
          )
        } catch (error) {
          console.error(`[opentui/web] Error creating session:`, error)
        }
      },

      message(ws: ServerWebSocket<WebSocketData>, message: string | Buffer) {
        try {
          // Unwrap multiplexed message: {id, data}
          const multiplexed = JSON.parse(String(message)) as MultiplexedIncoming

          // Check if it's a data message (not an event)
          if (!("data" in multiplexed)) {
            return
          }

          // Verify the id matches our tunnel
          if (multiplexed.id !== ws.data.tunnelId) {
            return
          }

          const sessionId = ws.data.sessionId
          if (!sessionId) {
            // Queue message until session is ready
            ws.data.pendingMessages.push(multiplexed.data)
            return
          }

          const data = JSON.parse(multiplexed.data) as ClientMessage
          sessionManager.handleMessage(sessionId, data)
        } catch (error) {
          console.error("[opentui/web] Invalid message:", error)
        }
      },

      close(ws: ServerWebSocket<WebSocketData>) {
        const sessionId = ws.data.sessionId
        sessionManager.destroySession(sessionId)
        Bun.write(
          Bun.stderr,
          `[opentui/web] Session ${sessionId} disconnected (${sessionManager.getSessionCount()} active)\n`,
        )
      },
    },

    /** Access the session manager for advanced use cases */
    sessionManager,
  }
}
