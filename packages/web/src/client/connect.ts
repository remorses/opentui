import type { ClientMessage, ServerMessage } from "../shared/types"
import { CanvasRenderer, type CanvasRendererOptions } from "./canvas-renderer"
import { MultiplexerConnection } from "./multiplexer"

type RendererOptions = Omit<CanvasRendererOptions, "container">

export interface ConnectOptions extends RendererOptions {
  /** Existing MultiplexerConnection to use */
  connection: MultiplexerConnection
  /** Terminal ID to subscribe to */
  id: string
  container: HTMLElement | string
  /** Whether the terminal should be focused initially (default: true) */
  focused?: boolean
  onConnect?: () => void
  onDisconnect?: () => void
  /** Called when an upstream closes */
  onUpstreamClosed?: (id: string) => void
  onError?: (error: Error) => void
}

export interface TerminalConnection {
  send: (message: ClientMessage) => void
  disconnect: () => void
  /** Returns the terminal size */
  getSize: () => { cols: number; rows: number }
  /** Set whether the terminal is focused for keyboard input */
  setFocused: (focused: boolean) => void
  /** Whether the terminal is currently focused */
  readonly focused: boolean
}

export function connectTerminal(options: ConnectOptions): TerminalConnection {
  const {
    connection,
    id,
    container: containerOption,
    focused: initialFocused = true,
    onConnect,
    onDisconnect,
    onUpstreamClosed,
    onError,
    ...rendererOptions
  } = options

  // Resolve container
  const container =
    typeof containerOption === "string" ? document.querySelector<HTMLElement>(containerOption) : containerOption

  if (!container) {
    throw new Error(`Container not found: ${containerOption}`)
  }

  // Create renderer
  const renderer = new CanvasRenderer({
    container,
    focused: initialFocused,
    ...rendererOptions,
  })

  // Send helper
  function send(message: ClientMessage) {
    connection.send(id, message)
  }

  // Handle incoming messages
  function handleMessage(message: ServerMessage) {
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
  }

  // Subscribe to events for our terminal ID
  const unsubscribe = connection.subscribeToId(id, (event) => {
    switch (event.type) {
      case "data":
        handleMessage(event.message)
        break
      case "upstream_closed":
        console.log(`[opentui/web] Upstream closed: ${event.id}`)
        onUpstreamClosed?.(event.id)
        break
      case "upstream_connected":
        console.log(`[opentui/web] Upstream connected: ${event.id}`)
        break
      case "upstream_discovered":
        console.log(`[opentui/web] Upstream discovered: ${event.id}`)
        break
      case "upstream_error":
        console.error(`[opentui/web] Upstream error: ${event.id}`, event.error)
        onError?.(new Error(event.error?.message ?? "Upstream error"))
        break
    }
  })

  // Track if we've sent initial resize
  let initialResizeSent = false

  const sendInitialResize = () => {
    if (initialResizeSent) return
    initialResizeSent = true
    const { cols, rows } = renderer.getSize()
    send({ type: "resize", cols, rows })
    onConnect?.()
  }

  // Subscribe to connection state changes
  const unsubscribeGlobal = connection.subscribe((event) => {
    // Send initial resize when multiplexer connects
    if (event.type === "multiplexer_connected") {
      sendInitialResize()
    }
    // Also handle upstream_connected for reconnection scenarios
    if (event.type === "upstream_connected" && event.id === id) {
      sendInitialResize()
    }
  })

  // If connection is already connected, send initial resize
  if (connection.connected) {
    sendInitialResize()
  }

  // Create hidden textarea for capturing text input
  const hiddenTextarea = document.createElement("textarea")
  hiddenTextarea.className = "opentui-input"
  hiddenTextarea.setAttribute("autocomplete", "off")
  hiddenTextarea.setAttribute("autocorrect", "off")
  hiddenTextarea.setAttribute("autocapitalize", "off")
  hiddenTextarea.setAttribute("spellcheck", "false")
  hiddenTextarea.setAttribute("tabindex", "0")
  if (initialFocused) {
    hiddenTextarea.setAttribute("autofocus", "")
  }
  hiddenTextarea.style.cssText = `
    position: absolute;
    left: -9999px;
    top: 0;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
    white-space: nowrap;
    overflow: hidden;
  `
  container.style.position = container.style.position || "relative"
  container.appendChild(hiddenTextarea)

  // Track if we're in a composition (IME input)
  let isComposing = false

  hiddenTextarea.addEventListener("compositionstart", () => {
    isComposing = true
  })

  hiddenTextarea.addEventListener("compositionend", () => {
    isComposing = false
  })

  // Handle text input
  const handleInput = (e: Event) => {
    if (isComposing) return

    const inputEvent = e as InputEvent
    const data = inputEvent.data

    if (data) {
      for (const char of data) {
        send({
          type: "key",
          key: char,
          modifiers: { shift: false, ctrl: false, meta: false, super: false },
        })
      }
    }

    hiddenTextarea.value = ""
  }

  hiddenTextarea.addEventListener("input", handleInput)

  // Handle special keys via keydown
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.target !== hiddenTextarea) return

    const modifierOnlyKeys = ["Alt", "Control", "Shift", "Meta", "CapsLock", "NumLock", "ScrollLock"]
    if (modifierOnlyKeys.includes(e.key)) return

    if (isComposing) return

    const isSpecialKey = e.key.length > 1 || e.ctrlKey || e.metaKey

    if (!isSpecialKey) return

    const isFKey = e.key.startsWith("F") && e.key.length <= 3 && !isNaN(Number(e.key.slice(1)))
    if (!isFKey && !e.metaKey) {
      e.preventDefault()
    }

    send({
      type: "key",
      key: e.key,
      modifiers: {
        shift: e.shiftKey,
        ctrl: e.ctrlKey,
        meta: e.altKey,
        super: e.metaKey,
      },
    })
  }

  // Setup mouse input
  const getTerminalCoords = (e: MouseEvent): { x: number; y: number } => {
    const rect = container.getBoundingClientRect()
    const { charWidth, cellHeight } = renderer.metrics

    const x = Math.floor((e.clientX - rect.left) / charWidth)
    const y = Math.floor((e.clientY - rect.top) / cellHeight)

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

  let scrollAccumulator = 0
  let scrollPending: { x: number; y: number } | null = null

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault()

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
        deltaLines = e.deltaY / renderer.metrics.cellHeight
        break
      }
    }

    scrollAccumulator += deltaLines

    if (!scrollPending) {
      scrollPending = getTerminalCoords(e)
      requestAnimationFrame(() => {
        const lines = Math.trunc(scrollAccumulator)
        if (lines !== 0) {
          send({ type: "scroll", x: scrollPending!.x, y: scrollPending!.y, lines })
          scrollAccumulator -= lines
        }
        scrollPending = null
      })
    }
  }

  // Click to focus
  const handleClick = () => {
    hiddenTextarea.focus()
  }

  // Attach event listeners
  hiddenTextarea.addEventListener("keydown", handleKeyDown)
  container.addEventListener("click", handleClick)
  container.addEventListener("mousedown", handleMouseDown)
  container.addEventListener("mousemove", handleMouseMove)
  container.addEventListener("mouseup", handleMouseUp)
  container.addEventListener("wheel", handleWheel, { passive: false })

  // Focus management
  const setFocused = (focused: boolean) => {
    renderer.setFocused(focused)
    if (focused) {
      hiddenTextarea.focus()
    } else {
      hiddenTextarea.blur()
    }
  }

  // Defer initial focus to ensure DOM is ready
  if (initialFocused) {
    hiddenTextarea.focus()

  }

  return {
    send,
    disconnect: () => {
      unsubscribe()
      unsubscribeGlobal()

      hiddenTextarea.removeEventListener("keydown", handleKeyDown)
      hiddenTextarea.removeEventListener("input", handleInput)
      container.removeEventListener("click", handleClick)
      container.removeEventListener("mousedown", handleMouseDown)
      container.removeEventListener("mousemove", handleMouseMove)
      container.removeEventListener("mouseup", handleMouseUp)
      container.removeEventListener("wheel", handleWheel)
      container.removeChild(hiddenTextarea)
      renderer.destroy()
    },
    getSize: () => renderer.getSize(),
    setFocused,
    get focused() {
      return document.activeElement === hiddenTextarea
    },
  }
}
