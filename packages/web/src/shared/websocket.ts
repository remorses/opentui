/**
 * Abstract WebSocket interface that works for both:
 * - Bun's ServerWebSocket (server mode)
 * - Standard WebSocket (tunnel client mode)
 */
export interface WebSocketLike {
  send(data: string | ArrayBuffer): void
  close(code?: number, reason?: string): void
  readonly readyState: number
}

/** WebSocket ready states */
export const WebSocketState = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const

/**
 * Adapter for Bun's ServerWebSocket
 */
export class ServerWebSocketAdapter implements WebSocketLike {
  constructor(private ws: { send(data: string | ArrayBuffer): void; close(code?: number, reason?: string): void; readyState: number }) {}
  
  send(data: string | ArrayBuffer): void {
    this.ws.send(data)
  }
  
  close(code?: number, reason?: string): void {
    this.ws.close(code, reason)
  }
  
  get readyState(): number {
    return this.ws.readyState
  }
}

/**
 * Adapter for standard WebSocket (browser or Node/Bun client)
 */
export class ClientWebSocketAdapter implements WebSocketLike {
  constructor(private ws: WebSocket) {}
  
  send(data: string | ArrayBuffer): void {
    this.ws.send(data)
  }
  
  close(code?: number, reason?: string): void {
    this.ws.close(code, reason)
  }
  
  get readyState(): number {
    return this.ws.readyState
  }
}
