import { MultiplexerConnection, connectTerminal, type TerminalConnection } from "../src/client"

const GRID_COLS = 3
const GRID_ROWS = 6
const TERMINAL_COUNT = GRID_COLS * GRID_ROWS

// Allow page scrolling
document.documentElement.style.cssText = `
  overflow-y: auto;
  overflow-x: hidden;
`

// Body as grid
document.body.style.cssText = `
  margin: 0;
  background: #0D1117;
  display: grid;
  grid-template-columns: repeat(${GRID_COLS}, auto);
  grid-template-rows: repeat(${GRID_ROWS}, auto);
  gap: 2px;
  justify-content: center;
  align-content: start;
  min-height: 100vh;
  padding: 2px 0;
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

// Shared renderer options
const rendererOptions = {
  fontFamily: "Consolas, monospace",
  fontSize: 14,
  lineHeight: 1.2,
  devicePixelRatio: 1.5,
  letterSpacing: 0,
  fontWeight: 500,
  fontWeightBold: 700,
  backgroundColor: "#0D1117",
  cols: 80,
  rows: 24,
} as const

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
    ...rendererOptions,
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
