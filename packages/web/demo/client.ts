import { MultiplexerConnection, connectTerminal } from "../src/client"

// Setup container to fill viewport with 2 side-by-side terminals
document.body.style.cssText = "margin: 0; background: #0D1117; overflow: hidden; display: flex; flex-direction: column;"

// Header showing sync info
const header = document.createElement("div")
header.style.cssText =
  "padding: 8px 16px; background: #161b22; color: #8b949e; font-family: system-ui; font-size: 12px; border-bottom: 1px solid #30363d;"
header.innerHTML = `
  <strong style="color: #58a6ff;">Synced Terminals Demo</strong> -
  Both terminals share the same connection and ID. Type in either one to see sync!
`
document.body.appendChild(header)

// Container for the two terminals
const terminalWrapper = document.createElement("div")
terminalWrapper.style.cssText = "display: flex; flex: 1; gap: 2px; background: #30363d;"
document.body.appendChild(terminalWrapper)

// Create two terminal containers
const container1 = document.createElement("div")
container1.id = "terminal1"
container1.style.cssText = "flex: 1; background: #0D1117;"
terminalWrapper.appendChild(container1)

const container2 = document.createElement("div")
container2.id = "terminal2"
container2.style.cssText = "flex: 1; background: #0D1117;"
terminalWrapper.appendChild(container2)

// Generate a unique tunnel ID for this session
const tunnelId = crypto.randomUUID()

// Create a centralized multiplexer connection
const multiplexer = new MultiplexerConnection({
  url: `ws://${window.location.host}`,
  namespace: "demo",
  ids: [tunnelId],
  onConnect: () => {
    console.log("[demo] Multiplexer connected")
  },
  onDisconnect: () => {
    console.log("[demo] Multiplexer disconnected")
  },
  onError: (error) => {
    console.error("[demo] Multiplexer error:", error)
  },
})

// Connect the multiplexer
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
} as const

// Create two terminals sharing the same connection and ID
const terminal1 = connectTerminal({
  connection: multiplexer,
  id: tunnelId,
  container: container1,
  ...rendererOptions,
})

const terminal2 = connectTerminal({
  connection: multiplexer,
  id: tunnelId,
  container: container2,
  focused: false, // Only first terminal is focused initially
  ...rendererOptions,
})

// Handle window resize
window.addEventListener("resize", () => {
  terminal1.resize()
  terminal2.resize()
})

// Focus management: click to focus
container1.addEventListener("click", () => {
  terminal1.setFocused(true)
  terminal2.setFocused(false)
  container1.style.outline = "2px solid #58a6ff"
  container2.style.outline = "none"
})

container2.addEventListener("click", () => {
  terminal2.setFocused(true)
  terminal1.setFocused(false)
  container2.style.outline = "2px solid #58a6ff"
  container1.style.outline = "none"
})

// Initial focus indicator
container1.style.outline = "2px solid #58a6ff"
