import { type Session } from "./session"
import { opentuiWebSocket } from "./websocket"

export interface ServeOptions {
  port: number
  hostname?: string
  maxCols?: number
  maxRows?: number
  frameRate?: number
  onConnection: (session: Session) => void | (() => void)
}

export interface WebServer {
  server: ReturnType<typeof Bun.serve>
  stop: () => void
}

/**
 * Convenience function to start a WebSocket server for OpenTUI.
 * For more control, use `opentuiWebSocket()` with `Bun.serve()` directly.
 *
 * @example
 * ```ts
 * import { serve } from '@opentui/web'
 *
 * serve({
 *   port: 3001,
 *   onConnection: (session) => {
 *     const root = createRoot(session.renderer)
 *     root.render(<App />)
 *     return () => root.unmount()
 *   }
 * })
 * ```
 */
export function serve(options: ServeOptions): WebServer {
  const { port, hostname = "0.0.0.0", maxCols, maxRows, frameRate, onConnection } = options

  const ws = opentuiWebSocket({
    maxCols,
    maxRows,
    frameRate,
    onConnection,
  })

  const server = Bun.serve({
    port,
    hostname,

    fetch(req, server) {
      const url = new URL(req.url)

      // Try WebSocket upgrade first
      const wsResponse = ws.fetch(req, server)
      if (wsResponse !== null) {
        return wsResponse
      }

      // Health check
      if (url.pathname === "/health") {
        return new Response(
          JSON.stringify({
            status: "ok",
            sessions: ws.sessionManager.getSessionCount(),
          }),
          { headers: { "Content-Type": "application/json" } },
        )
      }

      return new Response("Not found", { status: 404 })
    },

    websocket: ws.websocket,
  })

  console.log(`[opentui/web] Server running at http://${hostname}:${port}`)

  return {
    server,
    stop: () => {
      server.stop()
    },
  }
}
