import { connectTerminal } from "../src/client"

// Setup container to fill viewport
const container = document.getElementById("terminal")!
document.body.style.cssText = "margin: 0; background: #0D1117; overflow: hidden;"
container.style.cssText = "width: 100vw; height: 100vh;"

// Generate a unique tunnel ID for this session
const tunnelId = crypto.randomUUID()

const connection = connectTerminal({
  url: `ws://${window.location.host}`,
  namespace: "demo",
  ids: [tunnelId],
  container,
  useCanvas: true,
  fontFamily: "Consolas, monospace",
  fontSize: 14,
  lineHeight: 1.4,
  letterSpacing: 0,
  fontWeight: 500,
  fontWeightBold: 700,
  backgroundColor: "#0D1117",
})

// Handle window resize
window.addEventListener("resize", () => {
  connection.resize()
})
