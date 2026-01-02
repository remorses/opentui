import type { ClientMessage, ServerMessage, VTermData, LineDiff } from "../shared/types"
import { TerminalRenderer, type TerminalRendererOptions } from "./html-renderer"
import { CanvasRenderer, type CanvasRendererOptions } from "./canvas-renderer"

type BaseRendererOptions = Omit<TerminalRendererOptions, "container"> & Omit<CanvasRendererOptions, "container">

export interface ConnectOptions extends BaseRendererOptions {
  url: string
  container: HTMLElement | string
  /** Use canvas renderer with custom glyph support for pixel-perfect box-drawing (default: false) */
  useCanvas?: boolean
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
  const {
    url,
    container: containerOption,
    useCanvas = true,
    onConnect,
    onDisconnect,
    onError,
    ...rendererOptions
  } = options

  // Resolve container
  const container =
    typeof containerOption === "string" ? document.querySelector<HTMLElement>(containerOption) : containerOption

  if (!container) {
    throw new Error(`Container not found: ${containerOption}`)
  }

  // WebSocket reference (set after creation)
  let ws: WebSocket

  // Send helper
  function send(message: ClientMessage) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
    }
  }

  // Create renderer with resize callback
  const renderer = useCanvas
    ? new CanvasRenderer({
        container,
        ...rendererOptions,
        onResize: (size) => {
          send({ type: "resize", cols: size.cols, rows: size.rows })
        },
      })
    : new TerminalRenderer({
        container,
        ...rendererOptions,
        onResize: (size) => {
          send({ type: "resize", cols: size.cols, rows: size.rows })
        },
      })

  // Get initial size
  const { cols, rows } = renderer.getSize()

  // Create WebSocket connection
  const wsUrl = new URL(url)
  wsUrl.searchParams.set("cols", String(cols))
  wsUrl.searchParams.set("rows", String(rows))

  ws = new WebSocket(wsUrl.toString())

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

        case "selection":
          renderer.setSelection(message.anchor, message.focus)
          break

        case "selection-clear":
          renderer.clearSelection()
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

    // Ignore modifier-only key presses - they only affect other keys
    const modifierOnlyKeys = ["Alt", "Control", "Shift", "Meta", "CapsLock", "NumLock", "ScrollLock"]
    if (modifierOnlyKeys.includes(e.key)) {
      return
    }

    // Don't prevent default for F-keys and meta shortcuts - let browser also handle them
    const isFKey = e.key.startsWith("F") && e.key.length <= 3 && !isNaN(Number(e.key.slice(1)))
    if (!isFKey && !e.metaKey) {
      e.preventDefault()
    }

    // Map browser modifiers to terminal modifiers:
    // Browser altKey (Alt/Option) → Terminal meta (bit 2)
    // Browser metaKey (Cmd/Win) → Terminal super (bit 8)
    send({
      type: "key",
      key: e.key,
      modifiers: {
        shift: e.shiftKey,
        ctrl: e.ctrlKey,
        meta: e.altKey, // Alt/Option → meta
        super: e.metaKey, // Cmd/Win → super
      },
    })
  }

  // Setup mouse input
  const getTerminalCoords = (e: MouseEvent): { x: number; y: number } => {
    const rect = container.getBoundingClientRect()
    // Get cell dimensions from renderer (works for both HTML and Canvas renderers)
    const fontSize = (renderer as any).fontSize ?? 14
    const charWidth = (renderer as any).metrics?.charWidth ?? fontSize * 0.6
    const lineHeight = (renderer as any).metrics?.charHeight ?? fontSize * 1.2

    const x = Math.floor((e.clientX - rect.left) / charWidth)
    const y = Math.floor((e.clientY - rect.top) / lineHeight)

    return { x: Math.max(0, x), y: Math.max(0, y) }
  }

  let isDragging = false

  const handleMouseDown = (e: MouseEvent) => {
    isDragging = true
    const { x, y } = getTerminalCoords(e)
    send({ type: "mouse", action: "down", x, y, button: e.button })
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return
    const { x, y } = getTerminalCoords(e)
    send({ type: "mouse", action: "move", x, y })
  }

  const handleMouseUp = (e: MouseEvent) => {
    isDragging = false
    const { x, y } = getTerminalCoords(e)
    send({ type: "mouse", action: "up", x, y, button: e.button })
  }

  // Coalesce wheel events within a single animation frame
  let scrollAccumulator = 0
  let scrollPending: { x: number; y: number } | null = null

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault()

    // Convert to lines based on deltaMode
    let deltaLines: number
    switch (e.deltaMode) {
      case WheelEvent.DOM_DELTA_LINE:
        deltaLines = e.deltaY
        break
      case WheelEvent.DOM_DELTA_PAGE: {
        const { rows } = renderer.getSize()
        deltaLines = e.deltaY * rows
        break
      }
      default: {
        // DOM_DELTA_PIXEL - use renderer's actual line height
        const lineHeight = (renderer as any).metrics?.charHeight ?? 20
        deltaLines = e.deltaY / lineHeight
        break
      }
    }

    scrollAccumulator += deltaLines

    // Batch all wheel events within one animation frame into a single message
    if (!scrollPending) {
      scrollPending = getTerminalCoords(e)
      requestAnimationFrame(() => {
        const lines = Math.trunc(scrollAccumulator)
        if (lines !== 0) {
          send({ type: "scroll", x: scrollPending!.x, y: scrollPending!.y, lines })
          scrollAccumulator -= lines // keep fractional remainder
        }
        scrollPending = null
      })
    }
  }

  // Attach event listeners
  container.addEventListener("keydown", handleKeyDown)
  container.addEventListener("mousedown", handleMouseDown)
  container.addEventListener("mousemove", handleMouseMove)
  container.addEventListener("mouseup", handleMouseUp)
  container.addEventListener("wheel", handleWheel, { passive: false })

  // Make container focusable
  if (!container.hasAttribute("tabindex")) {
    container.setAttribute("tabindex", "0")
  }
  container.focus()

  return {
    send,
    disconnect: () => {
      ws.close()
      container.removeEventListener("keydown", handleKeyDown)
      container.removeEventListener("mousedown", handleMouseDown)
      container.removeEventListener("mousemove", handleMouseMove)
      container.removeEventListener("mouseup", handleMouseUp)
      container.removeEventListener("wheel", handleWheel)
      renderer.destroy()
    },
    resize: () => {
      const { cols, rows } = renderer.getSize()
      send({ type: "resize", cols, rows })
    },
  }
}
