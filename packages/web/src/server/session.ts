import type { ServerWebSocket } from "bun"
import type { VTermLine, ClientMessage, ServerMessage } from "../shared/types"
import { diffLines } from "../shared/span-differ"
import { createTestRenderer, MouseButtons } from "@opentui/core/testing"
import type { CliRenderer } from "@opentui/core"

/** Map browser key names to KeyCodes names expected by mockInput.pressKey */
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

/** Public session interface exposed to user's onConnection callback */
export interface Session {
  id: string
  renderer: CliRenderer
  cols: number
  rows: number
  send: (data: unknown) => void
  close: () => void
}

export interface CreateSessionOptions {
  id?: string
  cols?: number
  rows?: number
  maxCols?: number
  maxRows?: number
  frameRate?: number
  send: (message: ServerMessage) => void
  close: () => void
  onConnection: (session: Session) => void | (() => void)
}

export interface SessionHandle {
  handleMessage: (message: ClientMessage) => void
  destroy: () => void
}

/** Create a standalone session - reusable by both server and tunnel modes */
export async function createSession(options: CreateSessionOptions): Promise<SessionHandle> {
  const {
    id = crypto.randomUUID(),
    cols = 80,
    rows = 24,
    maxCols = 200,
    maxRows = 60,
    frameRate = 50,
    send,
    close,
    onConnection,
  } = options

  const testRenderer = await createTestRenderer({ width: cols, height: rows })

  // Session state
  let currentCols = cols
  let currentRows = rows
  let lastLines: VTermLine[] = []
  let lastCursor: { x: number; y: number; visible: boolean } | null = null
  let cleanup: (() => void) | undefined
  let rendering = false
  let pendingRender = false
  let renderInterval: Timer | null = null
  let destroyed = false

  // Helper to send messages
  function sendMessage(message: ServerMessage): void {
    try {
      send(message)
    } catch (error) {
      console.error(`Failed to send message to session ${id}:`, error)
    }
  }

  // Render loop tick
  async function tick(): Promise<void> {
    if (destroyed) return

    if (rendering) {
      pendingRender = true
      return
    }
    rendering = true

    try {
      await testRenderer.renderOnce()

      const data = testRenderer.captureSpans()
      const cursor = { x: data.cursor[0], y: data.cursor[1], visible: data.cursorVisible }

      if (lastLines.length === 0) {
        sendMessage({ type: "full", data })
        lastLines = data.lines
        lastCursor = cursor
        return
      }

      const changes = diffLines(lastLines, data.lines)

      if (changes.length > 0) {
        if (changes.length > data.lines.length * 0.5) {
          sendMessage({ type: "full", data })
        } else {
          sendMessage({ type: "diff", changes })
        }
        lastLines = data.lines
      }

      if (
        !lastCursor ||
        lastCursor.x !== cursor.x ||
        lastCursor.y !== cursor.y ||
        lastCursor.visible !== cursor.visible
      ) {
        sendMessage({ type: "cursor", ...cursor })
        lastCursor = cursor
      }
    } catch (error) {
      console.error(`Error in session ${id}:`, error)
      sendMessage({ type: "error", message: String(error) })
    } finally {
      rendering = false
      if (pendingRender) {
        pendingRender = false
        tick()
      }
    }
  }

  // Create public session interface
  const publicSession: Session = {
    id,
    renderer: testRenderer.renderer,
    cols: currentCols,
    rows: currentRows,
    send: (data: unknown) => sendMessage(data as ServerMessage),
    close,
  }

  // Listen for selection changes
  testRenderer.renderer.on("selection", (selection) => {
    if (selection) {
      sendMessage({
        type: "selection",
        anchor: selection.anchor,
        focus: selection.focus,
      })
    } else {
      sendMessage({ type: "selection-clear" })
    }
  })

  // Call user's onConnection handler
  const userCleanup = onConnection(publicSession)
  if (userCleanup) {
    cleanup = userCleanup
  }

  // Start render loop
  const frameTime = 1000 / frameRate
  renderInterval = setInterval(async () => {
    await tick()
  }, frameTime)

  // Handle incoming messages
  function handleMessage(message: ClientMessage): void {
    if (destroyed) return

    const { mockInput, mockMouse, resize } = testRenderer

    switch (message.type) {
      case "key": {
        const mappedKey = browserKeyMap[message.key] || message.key
        mockInput.pressKey(mappedKey, message.modifiers)
        tick()
        break
      }

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
        }
        tick()
        break
      }

      case "scroll": {
        const direction = message.lines > 0 ? "down" : "up"
        const count = Math.min(Math.abs(message.lines), 50)
        for (let i = 0; i < count; i++) {
          mockMouse.scroll(message.x, message.y, direction)
        }
        tick()
        break
      }

      case "resize": {
        const newCols = Math.min(message.cols, maxCols)
        const newRows = Math.min(message.rows, maxRows)
        resize(newCols, newRows)
        currentCols = newCols
        currentRows = newRows
        lastLines = [] // Force full redraw on resize
        tick()
        break
      }

      case "ping":
        sendMessage({ type: "pong" })
        break
    }
  }

  // Destroy session
  function destroy(): void {
    if (destroyed) return
    destroyed = true

    if (renderInterval) {
      clearInterval(renderInterval)
      renderInterval = null
    }

    if (cleanup) {
      try {
        cleanup()
      } catch (error) {
        console.error(`Error in cleanup callback for session ${id}:`, error)
      }
    }

    testRenderer.renderer.destroy()
  }

  return { handleMessage, destroy }
}

// SessionManager for server mode (manages multiple sessions)
interface InternalSession {
  id: string
  handle: SessionHandle
  ws: ServerWebSocket<{ sessionId: string }>
}

export class SessionManager {
  private sessions = new Map<string, InternalSession>()
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
    const cols = Math.min(parseInt(query.get("cols") || "80"), this.maxCols)
    const rows = Math.min(parseInt(query.get("rows") || "24"), this.maxRows)

    const handle = await createSession({
      id,
      cols,
      rows,
      maxCols: this.maxCols,
      maxRows: this.maxRows,
      frameRate: this.frameRate,
      send: (message) => {
        try {
          ws.send(JSON.stringify(message))
        } catch (error) {
          console.error(`Failed to send message to session ${id}:`, error)
        }
      },
      close: () => ws.close(),
      onConnection: this.onConnection,
    })

    this.sessions.set(id, { id, handle, ws })
    return id
  }

  handleMessage(sessionId: string, message: ClientMessage): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    session.handle.handleMessage(message)
  }

  destroySession(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    session.handle.destroy()
    this.sessions.delete(sessionId)
  }

  getSessionCount(): number {
    return this.sessions.size
  }
}
