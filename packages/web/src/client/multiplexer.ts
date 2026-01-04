import type { ClientMessage, ServerMessage, MultiplexedIncoming, MultiplexedOutgoing } from "../shared/types"

export interface MultiplexerOptions {
  /** WebSocket URL for the multiplexer endpoint */
  url: string
  /** Namespace for the multiplexer connection */
  namespace: string
  /** Terminal IDs to subscribe to. Empty array or undefined means subscribe to all IDs in namespace */
  ids?: string[]
  /** Initial terminal dimensions (used in query params) */
  cols?: number
  /** Initial terminal dimensions (used in query params) */
  rows?: number
  /** Called when connected to multiplexer */
  onConnect?: () => void
  /** Called when disconnected from multiplexer */
  onDisconnect?: () => void
  /** Called on error */
  onError?: (error: Error) => void
}

export type MultiplexerEvent =
  | { type: "data"; id: string; message: ServerMessage }
  | { type: "upstream_closed"; id: string }
  | { type: "upstream_connected"; id: string }
  | { type: "upstream_discovered"; id: string }
  | { type: "upstream_error"; id: string; error?: { message?: string; name?: string } }
  | { type: "multiplexer_connected" }
  | { type: "multiplexer_disconnected" }

export type MultiplexerListener = (event: MultiplexerEvent) => void

/**
 * A centralized WebSocket connection to a multiplexer endpoint.
 * Multiple terminals can share this connection and subscribe to events for specific IDs.
 */
export class MultiplexerConnection {
  private ws: WebSocket | null = null
  private listeners = new Set<MultiplexerListener>()
  private idListeners = new Map<string, Set<MultiplexerListener>>()
  private _connected = false

  public readonly namespace: string
  public readonly ids: string[]

  constructor(private options: MultiplexerOptions) {
    this.namespace = options.namespace
    this.ids = options.ids ?? []
  }

  /** Whether the connection is currently open */
  get connected(): boolean {
    return this._connected
  }

  /** Connect to the multiplexer WebSocket */
  connect(): void {
    if (this.ws) return

    const wsUrl = new URL(this.options.url)
    wsUrl.pathname = wsUrl.pathname.replace(/\/?$/, "/multiplexer")
    wsUrl.searchParams.set("namespace", this.namespace)
    for (const id of this.ids) {
      wsUrl.searchParams.append("id", id)
    }
    if (this.options.cols) {
      wsUrl.searchParams.set("cols", String(this.options.cols))
    }
    if (this.options.rows) {
      wsUrl.searchParams.set("rows", String(this.options.rows))
    }

    this.ws = new WebSocket(wsUrl.toString())

    this.ws.onopen = () => {
      this._connected = true
      console.log("[opentui/multiplexer] Connected")
      this.options.onConnect?.()
      this.emit({ type: "multiplexer_connected" })
    }

    this.ws.onclose = () => {
      this._connected = false
      console.log("[opentui/multiplexer] Disconnected")
      this.options.onDisconnect?.()
      this.emit({ type: "multiplexer_disconnected" })
      this.ws = null
    }

    this.ws.onerror = (event) => {
      console.error("[opentui/multiplexer] WebSocket error:", event)
      let errorMessage = "WebSocket error"
      if ("message" in event && typeof (event as any).message === "string") {
        errorMessage += ": " + (event as any).message
      }
      this.options.onError?.(new Error(errorMessage))
    }

    this.ws.onmessage = (event) => {
      try {
        const multiplexed = JSON.parse(event.data) as MultiplexedIncoming

        // Handle lifecycle events
        if ("event" in multiplexed) {
          let muxEvent: MultiplexerEvent
          switch (multiplexed.event) {
            case "upstream_closed":
              muxEvent = { type: "upstream_closed", id: multiplexed.id }
              break
            case "upstream_connected":
              muxEvent = { type: "upstream_connected", id: multiplexed.id }
              break
            case "upstream_discovered":
              muxEvent = { type: "upstream_discovered", id: multiplexed.id }
              break
            case "upstream_error":
              muxEvent = { type: "upstream_error", id: multiplexed.id, error: multiplexed.error }
              break
            default:
              return
          }
          this.emit(muxEvent)
          return
        }

        // Handle data messages
        if ("data" in multiplexed) {
          const message = JSON.parse(multiplexed.data) as ServerMessage
          this.emit({ type: "data", id: multiplexed.id, message })
        }
      } catch (error) {
        console.error("[opentui/multiplexer] Failed to parse message:", error)
      }
    }
  }

  /** Disconnect from the multiplexer */
  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this._connected = false
  }

  /** Send a client message to a specific terminal ID */
  send(id: string, message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const wrapped: MultiplexedOutgoing = { id, data: JSON.stringify(message) }
      this.ws.send(JSON.stringify(wrapped))
    }
  }

  /** Subscribe to all events from this multiplexer */
  subscribe(listener: MultiplexerListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Subscribe to events for a specific terminal ID only */
  subscribeToId(id: string, listener: MultiplexerListener): () => void {
    if (!this.idListeners.has(id)) {
      this.idListeners.set(id, new Set())
    }
    this.idListeners.get(id)!.add(listener)
    return () => {
      const listeners = this.idListeners.get(id)
      if (listeners) {
        listeners.delete(listener)
        if (listeners.size === 0) {
          this.idListeners.delete(id)
        }
      }
    }
  }

  private emit(event: MultiplexerEvent): void {
    // Notify global listeners
    for (const listener of this.listeners) {
      listener(event)
    }
    // Notify ID-specific listeners (only for events that have an id)
    if ("id" in event) {
      const idListeners = this.idListeners.get(event.id)
      if (idListeners) {
        for (const listener of idListeners) {
          listener(event)
        }
      }
    }
  }
}
