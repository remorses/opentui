/**
 * Grid client - discovers and displays multiple terminals in a grid layout.
 *
 * Connects to the tunnel with wildcard subscription (ids=[]) to discover
 * all terminals in a namespace dynamically.
 */

import { MultiplexerConnection, connectTerminal, findBestFontSize, measureCellSize, type TerminalConnection } from "../../src/client"

// Grid configuration - fixed like original client.ts
const GRID_COLS = 3
const GRID_ROWS = 3
const GAP = 2

// Terminal configuration
const TERMINAL_COLS = 80
const TERMINAL_ROWS = 24
const MIN_TERMINAL_COLS = 40
const MIN_TERMINAL_ROWS = 12
const FONT_SIZES = [14, 12, 10, 8]

// Font configuration
const FONT_FAMILY = "Consolas, monospace"
const LINE_HEIGHT = 1.4
const LETTER_SPACING = 0

// Get namespace from URL params or default
const urlParams = new URLSearchParams(window.location.search)
const namespace = urlParams.get("namespace") || "grid-demo"

// Tunnel WebSocket URL
const TUNNEL_WS_URL = "wss://opentui.net/_tunnel"

// Allow page scrolling
document.documentElement.style.cssText = `
  overflow-y: auto;
  overflow-x: hidden;
`

// Track discovered terminals
const discoveredIds: string[] = []
const terminals = new Map<string, { container: HTMLDivElement; terminal: TerminalConnection }>()
let focusedId: string | null = null

// Status display
const statusDiv = document.createElement("div")
statusDiv.style.cssText = `
  position: fixed;
  top: 10px;
  right: 10px;
  background: rgba(13, 17, 23, 0.9);
  color: #8b949e;
  padding: 8px 12px;
  border-radius: 6px;
  font-family: ${FONT_FAMILY};
  font-size: 12px;
  z-index: 1000;
  border: 1px solid #30363d;
`
document.body.appendChild(statusDiv)

function updateStatus() {
  statusDiv.innerHTML = `
    <div style="color: #4ecdc4; margin-bottom: 4px;">Namespace: ${namespace}</div>
    <div>Terminals: ${discoveredIds.length}</div>
    <div style="margin-top: 4px; font-size: 10px; color: #6e7681;">
      Run: bun demo/spawn.ts --namespace ${namespace}
    </div>
  `
}
updateStatus()

// Calculate layout based on viewport and terminal count
function calculateLayout(terminalCount: number) {
  const gridCols = Math.min(terminalCount || 1, MAX_GRID_COLS)
  const gridRows = Math.ceil((terminalCount || 1) / MAX_GRID_COLS)

  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  const availableWidth = (viewportWidth - GAP * (gridCols + 1)) / gridCols
  const availableHeight = (viewportHeight - GAP * (gridRows + 1)) / gridRows

  let { fontSize, cols, rows, cellWidth, cellHeight } = findBestFontSize({
    containerWidth: availableWidth,
    containerHeight: availableHeight,
    minCols: TERMINAL_COLS,
    minRows: TERMINAL_ROWS,
    fontSizes: FONT_SIZES,
    fontFamily: FONT_FAMILY,
    lineHeight: LINE_HEIGHT,
    letterSpacing: LETTER_SPACING,
  })

  if (cols < MIN_TERMINAL_COLS || rows < MIN_TERMINAL_ROWS) {
    cols = Math.max(cols, MIN_TERMINAL_COLS)
    rows = Math.max(rows, MIN_TERMINAL_ROWS)
    const smallestFont = FONT_SIZES[FONT_SIZES.length - 1]
    const cell = measureCellSize({
      fontSize: smallestFont,
      fontFamily: FONT_FAMILY,
      lineHeight: LINE_HEIGHT,
      letterSpacing: LETTER_SPACING,
    })
    cellWidth = cell.width
    cellHeight = cell.height
    fontSize = smallestFont
  }

  const terminalWidth = cols * cellWidth
  const terminalHeight = rows * cellHeight

  return { fontSize, cols, rows, cellWidth, cellHeight, terminalWidth, terminalHeight, gridCols, gridRows }
}

// Update grid layout
function updateGridLayout() {
  const count = discoveredIds.length
  if (count === 0) {
    document.body.style.cssText = `
      margin: 0;
      background: #0D1117;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: ${FONT_FAMILY};
      color: #8b949e;
    `
    return
  }

  const layout = calculateLayout(count)

  document.body.style.cssText = `
    margin: 0;
    background: #0D1117;
    display: grid;
    grid-template-columns: repeat(${layout.gridCols}, ${layout.terminalWidth}px);
    grid-template-rows: repeat(${layout.gridRows}, ${layout.terminalHeight}px);
    gap: ${GAP}px;
    justify-content: center;
    align-content: start;
    min-height: 100vh;
    padding: ${GAP}px 0;
    overflow: visible;
  `
}

// Focus a terminal by ID
function focusTerminal(id: string) {
  if (focusedId === id) return // Already focused
  
  const target = terminals.get(id)
  if (!target) return
  
  // First, focus the new terminal (this naturally blurs the old one)
  target.terminal.setFocused(true)
  target.container.style.outline = "2px solid #58a6ff"
  
  // Then update the old focused terminal's state
  if (focusedId) {
    const old = terminals.get(focusedId)
    if (old) {
      old.terminal.setFocused(false)
      old.container.style.outline = "none"
    }
  }
  
  focusedId = id
}

// Create a terminal for a discovered ID
function createTerminalForId(id: string, multiplexer: MultiplexerConnection) {
  if (terminals.has(id)) return

  const count = discoveredIds.length
  const layout = calculateLayout(count)

  const container = document.createElement("div")
  container.id = `terminal-${id}`
  container.dataset.terminalId = id
  document.body.appendChild(container)

  const isFirst = terminals.size === 0

  const terminal = connectTerminal({
    connection: multiplexer,
    id,
    container,
    focused: isFirst,
    fontFamily: FONT_FAMILY,
    fontSize: layout.fontSize,
    lineHeight: LINE_HEIGHT,
    devicePixelRatio: 1.5,
    letterSpacing: LETTER_SPACING,
    fontWeight: 500,
    fontWeightBold: 700,
    backgroundColor: "#0D1117",
    cols: layout.cols,
    rows: layout.rows,
  })

  terminals.set(id, { container, terminal })

  // Use mousedown for immediate focus (before click fires)
  container.addEventListener("mousedown", () => focusTerminal(id))

  if (isFirst) {
    focusedId = id
    container.style.outline = "2px solid #58a6ff"
  }

  console.log(`[grid] Created terminal for ${id} (${terminals.size} total)`)
  updateStatus()
}

// Remove a terminal
function removeTerminal(id: string) {
  const entry = terminals.get(id)
  if (entry) {
    entry.container.remove()
    terminals.delete(id)
  }

  const idx = discoveredIds.indexOf(id)
  if (idx !== -1) {
    discoveredIds.splice(idx, 1)
  }

  updateGridLayout()
  updateStatus()
  console.log(`[grid] Removed terminal ${id} (${terminals.size} remaining)`)
}

// Create multiplexer connection with wildcard (empty ids = subscribe to all)
const multiplexer = new MultiplexerConnection({
  url: TUNNEL_WS_URL,
  namespace,
  ids: [], // Empty = wildcard subscription, discover all terminals
})

// Listen for terminal discovery
multiplexer.subscribe((event) => {
  console.log(`[grid] Event:`, event.type, "id" in event ? event.id : "")

  switch (event.type) {
    case "upstream_discovered":
      if (!discoveredIds.includes(event.id)) {
        discoveredIds.push(event.id)
        discoveredIds.sort()
        updateGridLayout()
        createTerminalForId(event.id, multiplexer)
      }
      break

    case "upstream_connected":
      // Terminal is ready, nothing extra needed
      break

    case "upstream_closed":
      removeTerminal(event.id)
      break

    case "multiplexer_connected":
      console.log(`[grid] Connected to tunnel namespace: ${namespace}`)
      break

    case "multiplexer_disconnected":
      console.log(`[grid] Disconnected from tunnel`)
      break
  }
})

// Connect to tunnel
multiplexer.connect()
console.log(`[grid] Connecting to namespace: ${namespace}...`)

// Show waiting message if no terminals
updateGridLayout()
if (discoveredIds.length === 0) {
  const waitingDiv = document.createElement("div")
  waitingDiv.id = "waiting-message"
  waitingDiv.innerHTML = `
    <div style="text-align: center;">
      <div style="font-size: 18px; color: #4ecdc4; margin-bottom: 16px;">Waiting for terminals...</div>
      <div style="color: #6e7681; font-size: 14px;">
        Run this command to spawn a terminal:<br><br>
        <code style="background: #161b22; padding: 8px 16px; border-radius: 6px; color: #e6edf3;">
          bun demo/spawn.ts --namespace ${namespace}
        </code>
      </div>
    </div>
  `
  document.body.appendChild(waitingDiv)

  // Remove waiting message when first terminal appears
  const removeWaiting = multiplexer.subscribe((event) => {
    if (event.type === "upstream_discovered") {
      const el = document.getElementById("waiting-message")
      if (el) el.remove()
      removeWaiting()
    }
  })
}

// Tab / Shift+Tab to cycle focus
document.addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    e.preventDefault()
    const ids = Array.from(terminals.keys()).sort()
    if (ids.length === 0) return

    const currentIdx = focusedId ? ids.indexOf(focusedId) : -1
    const nextIdx = e.shiftKey
      ? (currentIdx - 1 + ids.length) % ids.length
      : (currentIdx + 1) % ids.length
    focusTerminal(ids[nextIdx])
  }
}, { capture: true })

// Handle window resize
let resizeTimeout: ReturnType<typeof setTimeout> | null = null
window.addEventListener("resize", () => {
  if (resizeTimeout) clearTimeout(resizeTimeout)
  resizeTimeout = setTimeout(() => {
    updateGridLayout()
  }, 100)
})
