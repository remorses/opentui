import { connectTerminal, MultiplexerConnection, measureCellSize } from "@opentuah/web/client"

// Terminal configuration
const FONT_FAMILY = "JetBrains Mono, Consolas, monospace"
const FONT_SIZE = 14
const LINE_HEIGHT = 1.4
const LETTER_SPACING = 0

// Measure cell size
const { width: cellWidth, height: cellHeight } = measureCellSize({
  fontSize: FONT_SIZE,
  fontFamily: FONT_FAMILY,
  lineHeight: LINE_HEIGHT,
  letterSpacing: LETTER_SPACING,
})

// Calculate terminal dimensions based on viewport
function calculateDimensions() {
  const cols = Math.floor(window.innerWidth / cellWidth)
  const rows = Math.floor(window.innerHeight / cellHeight)
  return { cols: Math.max(cols, 40), rows: Math.max(rows, 20) }
}

let { cols, rows } = calculateDimensions()

// Create container
const container = document.createElement("div")
container.style.cssText = `
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
`
document.body.appendChild(container)

// Generate a unique ID for this session
const terminalId = Math.random().toString(36).slice(2) + Date.now().toString(36)

// Create multiplexer connection
const multiplexer = new MultiplexerConnection({
  url: `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`,
  namespace: "website",
  ids: [terminalId],
  cols,
  rows,
})
multiplexer.connect()

// Connect terminal
const terminal = connectTerminal({
  connection: multiplexer,
  id: terminalId,
  container,
  focused: true,
  fontFamily: FONT_FAMILY,
  fontSize: FONT_SIZE,
  lineHeight: LINE_HEIGHT,
  devicePixelRatio: window.devicePixelRatio,
  letterSpacing: LETTER_SPACING,
  fontWeight: 400,
  fontWeightBold: 700,
  backgroundColor: "#0D1117",
  cols,
  rows,
})

// Handle window resize
let resizeTimeout: ReturnType<typeof setTimeout> | null = null
window.addEventListener("resize", () => {
  if (resizeTimeout) clearTimeout(resizeTimeout)
  resizeTimeout = setTimeout(() => {
    const { cols: newCols, rows: newRows } = calculateDimensions()
    terminal.send({ type: "resize", cols: newCols, rows: newRows })
  }, 100)
})
