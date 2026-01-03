import { createSession, type Session, type SessionHandle } from "./session"
import type { ClientMessage, ServerMessage } from "../shared/types"

const DEFAULT_TUNNEL_URL = "wss://opentui.net/_tunnel"

export interface TunnelOptions {
  /** Tunnel WebSocket URL. Defaults to wss://opentui.net/_tunnel */
  url?: string

  /** Namespace for the tunnel. Defaults to tunnelId */
  namespace?: string

  /** Tunnel ID. Defaults to a random UUID */
  tunnelId?: string

  /** Called when a browser connects */
  onConnection: (session: Session) => void | (() => void)

  /** Called when connected to tunnel with shareable URL */
  onReady?: (info: TunnelInfo) => void

  /** Called on disconnect from tunnel */
  onDisconnect?: () => void

  /** Called on error */
  onError?: (error: Error) => void

  /** Max terminal columns (default: 200) */
  maxCols?: number

  /** Max terminal rows (default: 60) */
  maxRows?: number

  /** Frame rate in fps (default: 50) */
  frameRate?: number

  /** Initial columns (default: 80) */
  cols?: number

  /** Initial rows (default: 24) */
  rows?: number
}

export interface TunnelInfo {
  tunnelId: string
  namespace: string
  wsUrl: string
  htmlUrl: string
}

export interface TunnelConnection {
  info: TunnelInfo
  disconnect: () => void
  readonly connected: boolean
}

/**
 * Connect to a WebSocket tunnel to expose your OpenTUI app via a public URL.
 *
 * @example
 * ```ts
 * import { connectTunnel } from '@opentui/web'
 * import { createRoot } from '@opentui/react'
 *
 * const tunnel = await connectTunnel({
 *   onConnection: (session) => {
 *     const root = createRoot(session.renderer)
 *     root.render(<App />)
 *     return () => root.unmount()
 *   }
 * })
 *
 * console.log(`Share: ${tunnel.info.htmlUrl}`)
 * ```
 */
export function connectTunnel(options: TunnelOptions): Promise<TunnelConnection> {
  const {
    url = DEFAULT_TUNNEL_URL,
    tunnelId = crypto.randomUUID(),
    onConnection,
    onReady,
    onDisconnect,
    onError,
    maxCols = 200,
    maxRows = 60,
    frameRate = 50,
    cols = 80,
    rows = 24,
  } = options

  const namespace = options.namespace ?? tunnelId
  const wsUrl = `${url}/upstream?namespace=${namespace}&id=${tunnelId}`

  // Derive HTML URL from WebSocket URL
  const htmlBaseUrl = url.replace("wss://", "https://").replace("ws://", "http://").replace("/_tunnel", "")
  const htmlUrl = `${htmlBaseUrl}/s/${namespace}/${tunnelId}`

  const info: TunnelInfo = {
    tunnelId,
    namespace,
    wsUrl: `${url}/multiplexer?namespace=${namespace}&id=${tunnelId}`,
    htmlUrl,
  }

  return new Promise((resolve, reject) => {
    let ws: WebSocket | null = null
    let session: SessionHandle | null = null
    let isConnected = false
    let pingInterval: Timer | null = null

    const start = Date.now()

    ws = new WebSocket(wsUrl)

    ws.onopen = async () => {
      isConnected = true
      const elapsed = Date.now() - start

      // Create session
      session = await createSession({
        id: tunnelId,
        cols,
        rows,
        maxCols,
        maxRows,
        frameRate,
        send: (message: ServerMessage) => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message))
          }
        },
        close: () => disconnect(),
        onConnection,
      })

      // Keep-alive ping every 20 seconds
      pingInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }))
        }
      }, 20000)

      console.log(`[opentui/tunnel] Connected in ${(elapsed / 1000).toFixed(2)}s`)
      console.log(`[opentui/tunnel] Share URL: ${info.htmlUrl}`)

      onReady?.(info)

      resolve({
        info,
        disconnect,
        get connected() {
          return isConnected
        },
      })
    }

    ws.onmessage = (event) => {
      if (!session) return

      try {
        const message = JSON.parse(String(event.data)) as ClientMessage
        if ((message as any).type === "pong") return
        session.handleMessage(message)
      } catch (error) {
        console.error("[opentui/tunnel] Failed to parse message:", error)
      }
    }

    ws.onclose = (event) => {
      const wasConnected = isConnected
      isConnected = false

      if (pingInterval) {
        clearInterval(pingInterval)
        pingInterval = null
      }

      if (session) {
        session.destroy()
        session = null
      }

      if (event.code === 4009 || event.reason?.includes("Upstream already connected")) {
        const error = new Error("Another upstream is already connected with this tunnel ID")
        console.error("[opentui/tunnel] Connection rejected: tunnel ID already in use")

        if (!wasConnected) {
          reject(error)
        } else {
          onError?.(error)
        }
        return
      }

      if (wasConnected) {
        console.log(`[opentui/tunnel] Disconnected (code: ${event.code})`)
        onDisconnect?.()
      } else {
        reject(new Error(`WebSocket closed: ${event.code} - ${event.reason}`))
      }
    }

    ws.onerror = () => {
      const error = new Error("WebSocket error")
      console.error("[opentui/tunnel] WebSocket error")

      if (!isConnected) {
        reject(error)
      } else {
        onError?.(error)
      }
    }

    function disconnect() {
      if (pingInterval) {
        clearInterval(pingInterval)
        pingInterval = null
      }

      if (session) {
        session.destroy()
        session = null
      }

      if (ws) {
        ws.close(1000, "Client disconnect")
        ws = null
      }

      isConnected = false
    }

    // Handle process signals for graceful shutdown
    const shutdown = () => {
      console.log("\n[opentui/tunnel] Shutting down...")
      disconnect()
      process.exit(0)
    }

    process.on("SIGINT", shutdown)
    process.on("SIGTERM", shutdown)
  })
}
