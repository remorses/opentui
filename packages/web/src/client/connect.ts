import type { ClientMessage, ServerMessage, VTermData, LineDiff } from "../shared/types"
import { TerminalRenderer, type TerminalRendererOptions } from "./html-renderer"

export interface ConnectOptions extends Omit<TerminalRendererOptions, "container"> {
  url: string
  container: HTMLElement | string
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (error: Error) => void
}

export interface TerminalConnection {
  send: (message: ClientMessage) => void
  disconnect: () => void
  resize: () => void
}

export function connectTerminal(options: ConnectOptions): TerminalConnection {
  const { url, container: containerOption, onConnect, onDisconnect, onError, ...rendererOptions } = options

  // Resolve container
  const container =
    typeof containerOption === "string" ? document.querySelector<HTMLElement>(containerOption) : containerOption

  if (!container) {
    throw new Error(`Container not found: ${containerOption}`)
  }

  // Create renderer
  const renderer = new TerminalRenderer({
    container,
    ...rendererOptions,
  })

  // Get initial size
  const { cols, rows } = renderer.getSize()

  // Create WebSocket connection
  const wsUrl = new URL(url)
  wsUrl.searchParams.set("cols", String(cols))
  wsUrl.searchParams.set("rows", String(rows))

  const ws = new WebSocket(wsUrl.toString())

  // Handle WebSocket events
  ws.onopen = () => {
    console.log("[opentui/web] Connected to server")
    onConnect?.()

    // Send initial resize
    send({ type: "resize", cols, rows })
  }

  ws.onclose = () => {
    console.log("[opentui/web] Disconnected from server")
    onDisconnect?.()
  }

  ws.onerror = (event) => {
    console.error("[opentui/web] WebSocket error:", event)
    onError?.(new Error("WebSocket error"))
  }

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data) as ServerMessage

      switch (message.type) {
        case "full":
          renderer.renderFull(message.data)
          break

        case "diff":
          renderer.applyDiff(message.changes)
          break

        case "cursor":
          renderer.updateCursor(message.x, message.y, message.visible)
          break

        case "error":
          console.error("[opentui/web] Server error:", message.message)
          onError?.(new Error(message.message))
          break
      }
    } catch (error) {
      console.error("[opentui/web] Failed to parse message:", error)
    }
  }

  // Setup keyboard input
  const handleKeyDown = (e: KeyboardEvent) => {
    // Don't capture if user is typing in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return
    }

    // Prevent default for most keys to avoid browser shortcuts
    if (!e.metaKey || e.key === "c" || e.key === "v") {
      e.preventDefault()
    }

    send({
      type: "key",
      key: e.key,
      modifiers: {
        shift: e.shiftKey,
        ctrl: e.ctrlKey,
        alt: e.altKey,
        meta: e.metaKey,
      },
    })
  }

  // Setup mouse input
  const getTerminalCoords = (e: MouseEvent): { x: number; y: number } => {
    const rect = container.getBoundingClientRect()
    const charWidth = renderer["fontSize"] * 0.6
    const lineHeight = renderer["fontSize"] * 1.2

    const x = Math.floor((e.clientX - rect.left) / charWidth)
    const y = Math.floor((e.clientY - rect.top) / lineHeight)

    return { x: Math.max(0, x), y: Math.max(0, y) }
  }

  const handleMouseDown = (e: MouseEvent) => {
    const { x, y } = getTerminalCoords(e)
    send({ type: "mouse", action: "down", x, y, button: e.button })
  }

  const handleMouseUp = (e: MouseEvent) => {
    const { x, y } = getTerminalCoords(e)
    send({ type: "mouse", action: "up", x, y, button: e.button })
  }

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault()
    const { x, y } = getTerminalCoords(e)
    // 4 = scroll up, 5 = scroll down (following xterm convention)
    send({ type: "mouse", action: "scroll", x, y, button: e.deltaY < 0 ? 4 : 5 })
  }

  // Attach event listeners
  container.addEventListener("keydown", handleKeyDown)
  container.addEventListener("mousedown", handleMouseDown)
  container.addEventListener("mouseup", handleMouseUp)
  container.addEventListener("wheel", handleWheel, { passive: false })

  // Make container focusable
  if (!container.hasAttribute("tabindex")) {
    container.setAttribute("tabindex", "0")
  }
  container.focus()

  // Send helper
  function send(message: ClientMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
    }
  }

  // Resize handler
  const resizeObserver = new ResizeObserver(() => {
    const { cols, rows } = renderer.getSize()
    send({ type: "resize", cols, rows })
  })
  resizeObserver.observe(container)

  return {
    send,
    disconnect: () => {
      ws.close()
      container.removeEventListener("keydown", handleKeyDown)
      container.removeEventListener("mousedown", handleMouseDown)
      container.removeEventListener("mouseup", handleMouseUp)
      container.removeEventListener("wheel", handleWheel)
      resizeObserver.disconnect()
      renderer.destroy()
    },
    resize: () => {
      const { cols, rows } = renderer.getSize()
      send({ type: "resize", cols, rows })
    },
  }
}
