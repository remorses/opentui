import { MultiplexerConnection, connectTerminal, findBestFontSize, measureCellSize, type TerminalConnection } from "../src/client"

// Grid configuration
const GRID_COLS = 3
const GRID_ROWS = 8
const TERMINAL_COUNT = GRID_COLS * GRID_ROWS

// Terminal configuration
const TERMINAL_COLS = 80 // desired cols
const TERMINAL_ROWS = 24 // desired rows
const MIN_TERMINAL_COLS = 40 // minimum cols (never go below)
const MIN_TERMINAL_ROWS = 12 // minimum rows (never go below)
const FONT_SIZES = [14, 12, 10, 8]
const GAP = 2

// Font configuration
const FONT_FAMILY = "Consolas, monospace"
const LINE_HEIGHT = 1.4
const LETTER_SPACING = 0

// Allow page scrolling
document.documentElement.style.cssText = `
  overflow-y: auto;
  overflow-x: hidden;
`

// Calculate layout based on viewport
function calculateLayout() {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  // Available space per terminal cell (accounting for gaps)
  const availableWidth = (viewportWidth - GAP * (GRID_COLS + 1)) / GRID_COLS
  const availableHeight = (viewportHeight - GAP * (GRID_ROWS + 1)) / GRID_ROWS

  // Find best font size that fits our desired terminal dimensions
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

  // Enforce minimum dimensions - if we can't fit desired size, use minimums
  // This may cause the grid to overflow and require scrolling
  if (cols < MIN_TERMINAL_COLS || rows < MIN_TERMINAL_ROWS) {
    cols = Math.max(cols, MIN_TERMINAL_COLS)
    rows = Math.max(rows, MIN_TERMINAL_ROWS)
    // Recalculate cell size at smallest font
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

  // Calculate actual terminal dimensions
  const terminalWidth = cols * cellWidth
  const terminalHeight = rows * cellHeight

  return { fontSize, cols, rows, cellWidth, cellHeight, terminalWidth, terminalHeight }
}

// Initial layout calculation
let layout = calculateLayout()

// Body as grid
document.body.style.cssText = `
  margin: 0;
  background: #0D1117;
  display: grid;
  grid-template-columns: repeat(${GRID_COLS}, ${layout.terminalWidth}px);
  grid-template-rows: repeat(${GRID_ROWS}, ${layout.terminalHeight}px);
  gap: ${GAP}px;
  justify-content: center;
  align-content: start;
  min-height: 100vh;
  padding: ${GAP}px 0;
  overflow: visible;
`

// Generate a unique tunnel ID for this session
const tunnelId = crypto.randomUUID()

// Create multiplexer connection
const multiplexer = new MultiplexerConnection({
  url: `ws://${window.location.host}`,
  namespace: "demo",
  ids: [tunnelId],
})
multiplexer.connect()

// Create terminals in a loop
const containers: HTMLDivElement[] = []
const terminals: TerminalConnection[] = []
let focusedIndex = 0

function focusTerminal(index: number) {
  focusedIndex = index
  terminals.forEach((t, j) => {
    const isCurrent = j === index
    t.setFocused(isCurrent)
    containers[j].style.outline = isCurrent ? "2px solid #58a6ff" : "none"
  })
}

for (let i = 0; i < TERMINAL_COUNT; i++) {
  const container = document.createElement("div")
  container.id = `terminal${i + 1}`
  document.body.appendChild(container)
  containers.push(container)

  const terminal = connectTerminal({
    connection: multiplexer,
    id: tunnelId,
    container,
    focused: i === 0,
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
  terminals.push(terminal)

  // Focus management: click to focus
  container.addEventListener("click", () => focusTerminal(i))
}

// Tab / Shift+Tab to cycle focus (capture phase to intercept before textarea)
document.addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    e.preventDefault()
    const next = e.shiftKey
      ? (focusedIndex - 1 + TERMINAL_COUNT) % TERMINAL_COUNT
      : (focusedIndex + 1) % TERMINAL_COUNT
    focusTerminal(next)
  }
}, { capture: true })

// Initial focus indicator
containers[0].style.outline = "2px solid #58a6ff"

// Handle window resize - update grid layout
let resizeTimeout: ReturnType<typeof setTimeout> | null = null
window.addEventListener("resize", () => {
  if (resizeTimeout) clearTimeout(resizeTimeout)
  resizeTimeout = setTimeout(() => {
    const newLayout = calculateLayout()
    document.body.style.gridTemplateColumns = `repeat(${GRID_COLS}, ${newLayout.terminalWidth}px)`
    document.body.style.gridTemplateRows = `repeat(${GRID_ROWS}, ${newLayout.terminalHeight}px)`
    // Note: Terminal resize requires reconnection or renderer update (not implemented)
  }, 100)
})
