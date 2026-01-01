import type { ServerWebSocket } from "bun"
import type { VTermLine, VTermData, ClientMessage, ServerMessage, LineDiff } from "../shared/types"
import { diffLines } from "../shared/span-differ"
import { createTestRenderer, MouseButtons } from "@opentui/core/testing"
import type { CliRenderer } from "@opentui/core"

// Map browser key names to KeyCodes names expected by mockInput.pressKey
const browserKeyMap: Record<string, string> = {
  ArrowUp: "ARROW_UP",
  ArrowDown: "ARROW_DOWN",
  ArrowLeft: "ARROW_LEFT",
  ArrowRight: "ARROW_RIGHT",
  Enter: "RETURN",
  Backspace: "BACKSPACE",
  Tab: "TAB",
  Escape: "ESCAPE",
  Delete: "DELETE",
  Home: "HOME",
  End: "END",
  PageUp: "PAGEUP",
  PageDown: "PAGEDOWN",
  Insert: "INSERT",
  F1: "F1",
  F2: "F2",
  F3: "F3",
  F4: "F4",
  F5: "F5",
  F6: "F6",
  F7: "F7",
  F8: "F8",
  F9: "F9",
  F10: "F10",
  F11: "F11",
  F12: "F12",
}

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
  testRenderer: Awaited<ReturnType<typeof createTestRenderer>>
  ws: ServerWebSocket<{ sessionId: string }>
  cols: number
  rows: number
  query: URLSearchParams
  lastLines: VTermLine[]
  lastCursor: { x: number; y: number; visible: boolean } | null
  cleanup?: () => void
  dirty: boolean
  rendering: boolean
  pendingRender: boolean
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

    const testRenderer = await createTestRenderer({ width: cols, height: rows })

    // Don't call start() - we control rendering via renderOnce() calls

    const session: InternalSession = {
      id,
      testRenderer,
      ws,
      cols,
      rows,
      query,
      lastLines: [],
      lastCursor: null,
      dirty: true,
      rendering: false,
      pendingRender: false,
    }

    this.sessions.set(id, session)

    // Create public session interface
    const publicSession: Session = {
      id,
      renderer: testRenderer.renderer,
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

    const { mockInput, mockMouse, resize } = session.testRenderer

    switch (message.type) {
      case "key":
        // Map browser key names to KeyCodes format
        const mappedKey = browserKeyMap[message.key] || message.key
        mockInput.pressKey(mappedKey, message.modifiers)
        session.dirty = true
        // Trigger immediate render after input
        this.tickSession(session)
        break

      case "mouse": {
        if (!message.action) break
        const button =
          message.button === 0 ? MouseButtons.LEFT : message.button === 2 ? MouseButtons.RIGHT : MouseButtons.MIDDLE
        switch (message.action) {
          case "down":
            mockMouse.pressDown(message.x, message.y, button)
            break
          case "up":
            mockMouse.release(message.x, message.y, button)
            break
          case "move":
            mockMouse.moveTo(message.x, message.y)
            break
          case "scroll":
            mockMouse.scroll(message.x, message.y, message.button === 4 ? "up" : "down")
            break
        }
        session.dirty = true
        // Trigger immediate render after mouse input
        this.tickSession(session)
        break
      }

      case "resize":
        const newCols = Math.min(message.cols, this.maxCols)
        const newRows = Math.min(message.rows, this.maxRows)
        resize(newCols, newRows)
        session.cols = newCols
        session.rows = newRows
        session.dirty = true
        session.lastLines = [] // Force full redraw on resize
        // Trigger immediate render after resize
        this.tickSession(session)
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
    session.testRenderer.renderer.destroy()

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
    // If already rendering, mark that we need another render
    if (session.rendering) {
      session.pendingRender = true
      return
    }
    session.rendering = true

    try {
      // Render to process any pending updates
      await session.testRenderer.renderOnce()

      const data = session.testRenderer.captureSpans()

      const cursor = { x: data.cursor[0], y: data.cursor[1], visible: data.cursorVisible }

      // Check if this is first frame or resize (need full update)
      if (session.lastLines.length === 0) {
        this.sendMessage(session, { type: "full", data })
        session.lastLines = data.lines
        session.lastCursor = cursor
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

      // Send cursor update if changed
      const lastCursor = session.lastCursor
      if (!lastCursor || lastCursor.x !== cursor.x || lastCursor.y !== cursor.y || lastCursor.visible !== cursor.visible) {
        this.sendMessage(session, { type: "cursor", ...cursor })
        session.lastCursor = cursor
      }

      session.dirty = false
    } catch (error) {
      console.error(`Error in session ${session.id}:`, error)
      this.sendMessage(session, { type: "error", message: String(error) })
    } finally {
      session.rendering = false
      // If a render was requested while we were rendering, do it now
      if (session.pendingRender) {
        session.pendingRender = false
        this.tickSession(session)
      }
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
