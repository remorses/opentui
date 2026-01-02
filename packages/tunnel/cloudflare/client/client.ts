import { connectTerminal } from "@opentui/web/client"

// Extract tunnelId from URL path: /s/{tunnelId}
const tunnelId = window.location.pathname.split("/").pop() // Take last segment as tunnelId

if (!tunnelId) {
  document.getElementById("terminal")!.innerHTML = `
    <div style="color: #f85149; font-family: system-ui; text-align: center; padding-top: 40vh;">
      <h1>Invalid tunnel URL</h1>
      <p>Missing tunnel ID in path</p>
    </div>
  `
} else {
  const wsUrl = `wss://${window.location.host}/_tunnel/downstream?id=${tunnelId}`

  connectTerminal({
    url: wsUrl,
    container: "#terminal",
    maxCols: 120,
    maxRows: 40,
    useCanvas: true,
    fontFamily: "Consolas, monospace",
    fontSize: 14,
    lineHeight: 1.4,
    letterSpacing: 0,
    fontWeight: 500,
    fontWeightBold: 700,
    onConnect: () => {
      console.log("[opentui] Connected to tunnel:", tunnelId)
    },
    onDisconnect: () => {
      console.log("[opentui] Disconnected from tunnel")
      // Show reconnecting message
      const terminal = document.getElementById("terminal")
      if (terminal) {
        terminal.innerHTML = `
          <div style="color: #8b949e; font-family: system-ui; text-align: center; padding-top: 40vh;">
            <h1>Reconnecting...</h1>
          </div>
        `
        // Reload after 2 seconds to reconnect
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
}
