import { SessionCore, type Session, type ClientMessage, type ServerMessage } from "@opentui/web"
import { ulid } from "ulid"

const DEFAULT_TUNNEL_URL = "wss://opentui.net/_tunnel"
const DEFAULT_HTML_URL = "https://opentui.net"

export interface TunnelOptions {
  /** 
   * Tunnel ID - acts as the secret for this tunnel.
   * If not provided, a random UUID will be generated.
   * Use a custom ID if you want to host the client yourself.
   */
  tunnelId?: string

  /** 
   * Tunnel WebSocket URL. 
   * Defaults to wss://opentui.net/_tunnel 
   */
  tunnelUrl?: string

  /**
   * Base URL for the hosted HTML client.
   * Defaults to https://opentui.net
   * Set to null to disable HTML URL logging.
   */
  htmlUrl?: string | null

  /** Called when a browser connects */
  onConnection: (session: Session) => void | (() => void)

  /** Called when connected to tunnel with shareable URLs */
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
  /** Tunnel session ID */
  tunnelId: string

  /** WebSocket URL for custom client connections */
  wsUrl: string

  /** HTML page URL (if htmlUrl is configured) */
  htmlUrl: string | null
}

export interface TunnelConnection {
  /** Tunnel info with URLs */
  info: TunnelInfo

  /** Disconnect from tunnel */
  disconnect: () => void

  /** Whether currently connected */
  readonly connected: boolean
}

/**
 * Connect to a WebSocket tunnel to expose your OpenTUI app via a public URL.
 * Returns a promise that resolves when connected, or rejects on error.
 * 
 * @example
 * ```ts
 * import { connectTunnel } from '@opentui/tunnel'
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
    tunnelId = ulid().toLowerCase(),
    tunnelUrl = DEFAULT_TUNNEL_URL,
    htmlUrl = DEFAULT_HTML_URL,
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

  const wsUrl = `${tunnelUrl}/upstream?id=${tunnelId}`
  const fullHtmlUrl = htmlUrl ? `${htmlUrl}/s/${tunnelId}` : null

  const info: TunnelInfo = {
    tunnelId,
    wsUrl: `${tunnelUrl}/downstream?id=${tunnelId}`,
    htmlUrl: fullHtmlUrl,
  }

  return new Promise((resolve, reject) => {
    let ws: WebSocket | null = null
    let session: SessionCore | null = null
    let isConnected = false
    let pingInterval: Timer | null = null

    const start = Date.now()

    ws = new WebSocket(wsUrl)

    ws.onopen = async () => {
      isConnected = true
      const elapsed = Date.now() - start

      // Create session
      session = new SessionCore({
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
        onConnection,
      })

      await session.init(() => {
        // Close callback - disconnect tunnel
        disconnect()
      })

      // Keep-alive ping every 20 seconds
      pingInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }))
        }
      }, 20000)

      // Log URLs
      console.log(`[opentui/tunnel] Connected to tunnel in ${(elapsed / 1000).toFixed(2)}s`)
      console.log(`[opentui/tunnel] WebSocket URL: ${info.wsUrl}`)
      if (info.htmlUrl) {
        console.log(`[opentui/tunnel] Share URL: ${info.htmlUrl}`)
      }

      // Notify ready
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
        // Ignore pong responses
        if ((message as any).type === "pong") return
        session.handleMessage(message)
      } catch (error) {
        console.error("[opentui/tunnel] Failed to parse message:", error)
      }
    }

    ws.onclose = (event) => {
      const wasConnected = isConnected
      isConnected = false

      // Clear ping interval
      if (pingInterval) {
        clearInterval(pingInterval)
        pingInterval = null
      }

      // Clean up session
      if (session) {
        session.destroy()
        session = null
      }

      // Handle specific error codes
      if (event.code === 4009 || event.reason?.includes("Upstream already connected")) {
        const error = new Error("Connection rejected: Another upstream is already connected with this tunnel ID")
        console.error("\n[opentui/tunnel] Connection failed: Another upstream is already connected!")
        console.error("   This usually means another instance is running with the same tunnel ID.")
        console.error("   Solutions:")
        console.error("   1. Stop the other instance first")
        console.error("   2. Use a different tunnelId")
        console.error("   3. Wait for the other instance to disconnect\n")
        
        if (!wasConnected) {
          reject(error)
        } else {
          onError?.(error)
        }
        return
      }

      if (wasConnected) {
        console.log(`[opentui/tunnel] Disconnected (code: ${event.code}, reason: ${event.reason || "none"})`)
        onDisconnect?.()
      } else {
        // Connection failed before open
        const error = new Error(`WebSocket closed during connection: ${event.code} - ${event.reason}`)
        reject(error)
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
