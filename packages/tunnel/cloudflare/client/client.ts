import { MultiplexerConnection, connectTerminal } from "@opentui/web/client"

// Extract namespace and tunnelId from URL path: /s/{namespace}/{tunnelId}
const pathParts = window.location.pathname.split("/").filter(Boolean)
// pathParts = ["s", namespace, tunnelId]
const namespace = pathParts[1]
const tunnelId = pathParts[2]

if (!namespace || !tunnelId) {
  document.getElementById("terminal")!.innerHTML = `
    <div style="color: #f85149; font-family: system-ui; text-align: center; padding-top: 40vh;">
      <h1>Invalid tunnel URL</h1>
      <p>Expected format: /s/{namespace}/{tunnelId}</p>
    </div>
  `
} else {
  // Setup container to fill viewport
  const container = document.getElementById("terminal")!
  document.body.style.cssText = "margin: 0; background: #1e1e1e; overflow: hidden;"
  container.style.cssText = "width: 100vw; height: 100vh;"

  const wsUrl = `wss://${window.location.host}/_tunnel`

  // Create centralized multiplexer connection
  const multiplexer = new MultiplexerConnection({
    url: wsUrl,
    namespace,
    ids: [tunnelId],
    onConnect: () => {
      console.log("[opentui] Connected to tunnel:", tunnelId, "namespace:", namespace)
    },
    onDisconnect: () => {
      console.log("[opentui] Disconnected from tunnel")
      const terminal = document.getElementById("terminal")
      if (terminal) {
        terminal.innerHTML = `
          <div style="color: #8b949e; font-family: system-ui; text-align: center; padding-top: 40vh;">
            <h1>Reconnecting...</h1>
          </div>
        `
        setTimeout(() => window.location.reload(), 2000)
      }
    },
    onError: (error) => {
      console.error("[opentui] Error:", error)
      const terminal = document.getElementById("terminal")
      if (terminal && error.message.includes("4008")) {
        terminal.innerHTML = `
          <div style="color: #f85149; font-family: system-ui; text-align: center; padding-top: 40vh;">
            <h1>Tunnel not active</h1>
            <p>The upstream application is not connected.</p>
          </div>
        `
      }
    },
  })

  // Connect the multiplexer
  multiplexer.connect()

  const connection = connectTerminal({
    connection: multiplexer,
    id: tunnelId,
    container,
    fontFamily: "Consolas, monospace",
    fontSize: 14,
    lineHeight: 1.4,
    letterSpacing: 0,
    fontWeight: 500,
    fontWeightBold: 700,
    backgroundColor: "#1e1e1e",
    onUpstreamClosed: (id) => {
      console.log("[opentui] Upstream closed:", id)
      const terminal = document.getElementById("terminal")
      if (terminal) {
        terminal.innerHTML = `
          <div style="color: #f85149; font-family: system-ui; text-align: center; padding-top: 40vh;">
            <h1>Tunnel closed</h1>
            <p>The upstream application disconnected.</p>
          </div>
        `
        setTimeout(() => window.location.reload(), 2000)
      }
    },
  })

  // Handle window resize
  window.addEventListener("resize", () => {
    connection.resize()
  })
}
