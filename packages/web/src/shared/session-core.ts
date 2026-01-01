import type { VTermLine, ClientMessage, ServerMessage } from "./types"
import type { WebSocketLike } from "./websocket"
import { diffLines } from "./span-differ"
import { createTestRenderer, MouseButtons } from "@opentui/core/testing"
import type { CliRenderer } from "@opentui/core"

/** Map browser key names to KeyCodes names expected by mockInput.pressKey */
export const browserKeyMap: Record<string, string> = {
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

export interface SessionCoreOptions {
  id: string
  cols: number
  rows: number
  maxCols: number
  maxRows: number
  frameRate: number
  send: (message: ServerMessage) => void
  onConnection: (session: Session) => void | (() => void)
}

/** Core session state and logic shared between server and tunnel modes */
export class SessionCore {
  public id: string
  public cols: number
  public rows: number
  public testRenderer!: Awaited<ReturnType<typeof createTestRenderer>>
  
  private maxCols: number
  private maxRows: number
  private frameRate: number
  private send: (message: ServerMessage) => void
  private onConnection: (session: Session) => void | (() => void)
  
  private lastLines: VTermLine[] = []
  private lastCursor: { x: number; y: number; visible: boolean } | null = null
  private cleanup?: () => void
  private dirty = true
  private rendering = false
  private pendingRender = false
  private renderInterval: Timer | null = null
  private destroyed = false

  constructor(options: SessionCoreOptions) {
    this.id = options.id
    this.cols = options.cols
    this.rows = options.rows
    this.maxCols = options.maxCols
    this.maxRows = options.maxRows
    this.frameRate = options.frameRate
    this.send = options.send
    this.onConnection = options.onConnection
  }

  /** Initialize the session (async because createTestRenderer is async) */
  async init(closeSession: () => void): Promise<void> {
    this.testRenderer = await createTestRenderer({ width: this.cols, height: this.rows })

    // Create public session interface
    const publicSession: Session = {
      id: this.id,
      renderer: this.testRenderer.renderer,
      cols: this.cols,
      rows: this.rows,
      send: (data: unknown) => {
        this.send(data as ServerMessage)
      },
      close: closeSession,
    }

    // Call user's onConnection handler
    const cleanup = this.onConnection(publicSession)
    if (cleanup) {
      this.cleanup = cleanup
    }

    // Start render loop
    this.startRenderLoop()
  }

  /** Handle incoming message from client */
  handleMessage(message: ClientMessage): void {
    if (this.destroyed) return
    
    const { mockInput, mockMouse, resize } = this.testRenderer

    switch (message.type) {
      case "key": {
        const mappedKey = browserKeyMap[message.key] || message.key
        mockInput.pressKey(mappedKey, message.modifiers)
        this.dirty = true
        this.tick()
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
          case "scroll":
            mockMouse.scroll(message.x, message.y, message.button === 4 ? "up" : "down")
            break
        }
        this.dirty = true
        this.tick()
        break
      }

      case "resize": {
        const newCols = Math.min(message.cols, this.maxCols)
        const newRows = Math.min(message.rows, this.maxRows)
        resize(newCols, newRows)
        this.cols = newCols
        this.rows = newRows
        this.dirty = true
        this.lastLines = [] // Force full redraw on resize
        this.tick()
        break
      }

      case "ping":
        this.send({ type: "pong" })
        break
    }
  }

  /** Destroy the session and clean up resources */
  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true

    if (this.renderInterval) {
      clearInterval(this.renderInterval)
      this.renderInterval = null
    }

    if (this.cleanup) {
      this.cleanup()
    }

    this.testRenderer.renderer.destroy()
  }

  private startRenderLoop(): void {
    const frameTime = 1000 / this.frameRate

    this.renderInterval = setInterval(async () => {
      await this.tick()
    }, frameTime)
  }

  private async tick(): Promise<void> {
    if (this.destroyed) return
    
    // If already rendering, mark that we need another render
    if (this.rendering) {
      this.pendingRender = true
      return
    }
    this.rendering = true

    try {
      // Render to process any pending updates
      await this.testRenderer.renderOnce()

      const data = this.testRenderer.captureSpans()
      const cursor = { x: data.cursor[0], y: data.cursor[1], visible: data.cursorVisible }

      // Check if this is first frame or resize (need full update)
      if (this.lastLines.length === 0) {
        this.send({ type: "full", data })
        this.lastLines = data.lines
        this.lastCursor = cursor
        this.dirty = false
        return
      }

      // Diff and send only changed lines
      const changes = diffLines(this.lastLines, data.lines)

      if (changes.length > 0) {
        // If more than 50% of lines changed, send full update
        if (changes.length > data.lines.length * 0.5) {
          this.send({ type: "full", data })
        } else {
          this.send({ type: "diff", changes })
        }
        this.lastLines = data.lines
      }

      // Send cursor update if changed
      const lastCursor = this.lastCursor
      if (!lastCursor || lastCursor.x !== cursor.x || lastCursor.y !== cursor.y || lastCursor.visible !== cursor.visible) {
        this.send({ type: "cursor", ...cursor })
        this.lastCursor = cursor
      }

      this.dirty = false
    } catch (error) {
      console.error(`Error in session ${this.id}:`, error)
      this.send({ type: "error", message: String(error) })
    } finally {
      this.rendering = false
      // If a render was requested while we were rendering, do it now
      if (this.pendingRender) {
        this.pendingRender = false
        this.tick()
      }
    }
  }
}
