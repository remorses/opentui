import { MultiplexerConnection, connectTerminal } from "@opentui/web/client"

// Extract namespace and tunnelId from URL path: /s/{namespace}/{tunnelId}
const [, , namespace, tunnelId] = window.location.pathname.split("/")

const container = document.getElementById("terminal")!

if (!namespace || !tunnelId) {
  container.innerHTML = `
    <div style="color: #f85149; font-family: system-ui; text-align: center; padding-top: 40vh;">
      <h1>Invalid tunnel URL</h1>
      <p>Expected format: /s/{namespace}/{tunnelId}</p>
    </div>
  `
} else {
  document.body.style.cssText = "margin: 0; background: #1e1e1e; overflow: hidden;"
  container.style.cssText = "width: 100vw; height: 100vh;"

  const multiplexer = new MultiplexerConnection({
    url: `wss://${window.location.host}/_tunnel`,
    namespace,
    ids: [tunnelId],
    onConnect: () => console.log("[opentui] Connected:", namespace, tunnelId),
    onDisconnect: () => {
      console.log("[opentui] Disconnected")
      container.innerHTML = `
        <div style="color: #8b949e; font-family: system-ui; text-align: center; padding-top: 40vh;">
          <h1>Reconnecting...</h1>
        </div>
      `
      setTimeout(() => window.location.reload(), 2000)
    },
    onError: (error) => {
      console.error("[opentui] Error:", error)
      if (error.message.includes("4008")) {
        container.innerHTML = `
          <div style="color: #f85149; font-family: system-ui; text-align: center; padding-top: 40vh;">
            <h1>Tunnel not active</h1>
            <p>The upstream application is not connected.</p>
          </div>
        `
      }
    },
  })

  multiplexer.connect()

  const terminal = connectTerminal({
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
    onUpstreamClosed: () => {
      console.log("[opentui] Upstream closed")
      container.innerHTML = `
        <div style="color: #f85149; font-family: system-ui; text-align: center; padding-top: 40vh;">
          <h1>Tunnel closed</h1>
          <p>The upstream application disconnected.</p>
        </div>
      `
      setTimeout(() => window.location.reload(), 2000)
    },
  })

  window.addEventListener("resize", () => terminal.resize())
}
