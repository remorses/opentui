import type { ServerWebSocket } from "bun"
import type { VTermLine, VTermData, ClientMessage, ServerMessage, LineDiff } from "../shared/types"
import { diffLines } from "../shared/span-differ"
import { createWebRenderer, type WebRenderer } from "./web-renderer"
import type { CliRenderer } from "@opentui/core"

export interface Session {
  id: string
  renderer: CliRenderer
  cols: number
  rows: number
  query: URLSearchParams
  send: (data: unknown) => void
  close: () => void
}

interface InternalSession {
  id: string
  webRenderer: WebRenderer
  ws: ServerWebSocket<{ sessionId: string }>
  cols: number
  rows: number
  query: URLSearchParams
  lastLines: VTermLine[]
  cleanup?: () => void
  dirty: boolean
}

export class SessionManager {
  private sessions = new Map<string, InternalSession>()
  private renderInterval: Timer | null = null
  private frameRate: number
  private maxCols: number
  private maxRows: number
  private onConnection: (session: Session) => void | (() => void)

  constructor(options: {
    frameRate?: number
    maxCols?: number
    maxRows?: number
    onConnection: (session: Session) => void | (() => void)
  }) {
    this.frameRate = options.frameRate ?? 50
    this.maxCols = options.maxCols ?? 200
    this.maxRows = options.maxRows ?? 60
    this.onConnection = options.onConnection
  }

  async createSession(ws: ServerWebSocket<{ sessionId: string }>, query: URLSearchParams): Promise<string> {
    const id = crypto.randomUUID()

    // Get initial size from query or use defaults
    const cols = Math.min(parseInt(query.get("cols") || "80"), this.maxCols)
    const rows = Math.min(parseInt(query.get("rows") || "24"), this.maxRows)

    const webRenderer = await createWebRenderer({ cols, rows })

    const session: InternalSession = {
      id,
      webRenderer,
      ws,
      cols,
      rows,
      query,
      lastLines: [],
      dirty: true,
    }

    this.sessions.set(id, session)

    // Create public session interface
    const publicSession: Session = {
      id,
      renderer: webRenderer.renderer,
      cols,
      rows,
      query,
      send: (data: unknown) => {
        ws.send(JSON.stringify(data))
      },
      close: () => {
        ws.close()
      },
    }

    // Call user's onConnection handler
    const cleanup = this.onConnection(publicSession)
    if (cleanup) {
      session.cleanup = cleanup
    }

    // Start render loop if not already running
    if (!this.renderInterval) {
      this.startRenderLoop()
    }

    return id
  }

  handleMessage(sessionId: string, message: ClientMessage) {
    const session = this.sessions.get(sessionId)
    if (!session) return

    const { webRenderer } = session

    switch (message.type) {
      case "key":
        webRenderer.injectKey(message.key, message.modifiers)
        session.dirty = true
        break

      case "mouse":
        switch (message.action) {
          case "click":
            webRenderer.injectMouseClick(message.x, message.y, message.button)
            break
          case "move":
            webRenderer.injectMouseMove(message.x, message.y)
            break
          case "scroll":
            webRenderer.injectMouseScroll(message.x, message.y, message.button === 4 ? "up" : "down")
            break
        }
        session.dirty = true
        break

      case "resize":
        const newCols = Math.min(message.cols, this.maxCols)
        const newRows = Math.min(message.rows, this.maxRows)
        webRenderer.resize(newCols, newRows)
        session.cols = newCols
        session.rows = newRows
        session.dirty = true
        session.lastLines = [] // Force full redraw on resize
        break

      case "ping":
        this.sendMessage(session, { type: "pong" })
        break
    }
  }

  destroySession(sessionId: string) {
    const session = this.sessions.get(sessionId)
    if (!session) return

    // Call cleanup handler
    if (session.cleanup) {
      session.cleanup()
    }

    // Destroy renderer
    session.webRenderer.destroy()

    this.sessions.delete(sessionId)

    // Stop render loop if no sessions
    if (this.sessions.size === 0 && this.renderInterval) {
      clearInterval(this.renderInterval)
      this.renderInterval = null
    }
  }

  private startRenderLoop() {
    const frameTime = 1000 / this.frameRate

    this.renderInterval = setInterval(async () => {
      for (const session of this.sessions.values()) {
        await this.tickSession(session)
      }
    }, frameTime)
  }

  private async tickSession(session: InternalSession) {
    try {
      // Always render to process any pending updates
      await session.webRenderer.render()

      const data = session.webRenderer.captureSpans()

      // Check if this is first frame or resize (need full update)
      if (session.lastLines.length === 0) {
        this.sendMessage(session, { type: "full", data })
        session.lastLines = data.lines
        session.dirty = false
        return
      }

      // Diff and send only changed lines
      const changes = diffLines(session.lastLines, data.lines)

      if (changes.length > 0) {
        // If more than 50% of lines changed, send full update
        if (changes.length > data.lines.length * 0.5) {
          this.sendMessage(session, { type: "full", data })
        } else {
          this.sendMessage(session, { type: "diff", changes })
        }
        session.lastLines = data.lines
      }

      session.dirty = false
    } catch (error) {
      console.error(`Error in session ${session.id}:`, error)
      this.sendMessage(session, { type: "error", message: String(error) })
    }
  }

  private sendMessage(session: InternalSession, message: ServerMessage) {
    try {
      session.ws.send(JSON.stringify(message))
    } catch (error) {
      console.error(`Failed to send message to session ${session.id}:`, error)
    }
  }

  getSessionCount(): number {
    return this.sessions.size
  }
}
