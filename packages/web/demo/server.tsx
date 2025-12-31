import { opentuiWebSocket } from "../src/index"
import { createRoot, useKeyboard } from "@opentui/react"
import { useState } from "react"

// Simple counter app component
function CounterApp() {
  const [count, setCount] = useState(0)
  const [message, setMessage] = useState("Press +/- to change count, r to reset")

  useKeyboard((input) => {
    if (input === "+" || input === "=") {
      setCount((c) => c + 1)
    } else if (input === "-" || input === "_") {
      setCount((c) => c - 1)
    } else if (input === "r") {
      setCount(0)
      setMessage("Counter reset!")
      setTimeout(() => setMessage("Press +/- to change count, r to reset"), 2000)
    } else if (input === "q") {
      process.exit(0)
    }
  })

  return (
    <box flexDirection="column" padding={1}>
      <box marginBottom={1}>
        <text bold fg="#4ECDC4">
          OpenTUI Web Demo
        </text>
      </box>

      <box
        borderStyle="round"
        borderColor="#888"
        padding={1}
        flexDirection="column"
        alignItems="center"
        width={40}
      >
        <text>Counter Value:</text>
        <text bold fg={count >= 0 ? "#22c55e" : "#ef4444"}>
          {count}
        </text>
      </box>

      <box marginTop={1}>
        <text fg="#888">{message}</text>
      </box>

      <box marginTop={1} flexDirection="column">
        <text fg="#666">Controls:</text>
        <text fg="#666">  + / - : Increment / Decrement</text>
        <text fg="#666">  r     : Reset</text>
        <text fg="#666">  q     : Quit server</text>
      </box>
    </box>
  )
}

// Transpile client.ts to JS
const clientBuild = await Bun.build({
  entrypoints: [import.meta.dir + "/client.ts"],
  minify: false,
})
const clientJs = await clientBuild.outputs[0].text()

// Create WebSocket handler
const ws = opentuiWebSocket({
  maxCols: 120,
  maxRows: 40,
  frameRate: 30,
  onConnection: (session) => {
    console.log(`New session: ${session.id}`)
    
    const root = createRoot(session.renderer)
    root.render(<CounterApp />)
    
    return () => {
      console.log(`Session closed: ${session.id}`)
      root.unmount()
    }
  },
})

// Start server with Bun's native static file serving
const server = Bun.serve({
  port: 3001,
  hostname: "0.0.0.0",
  
  // Serve static files from demo directory
  static: {
    "/": new Response(await Bun.file(import.meta.dir + "/index.html").bytes(), {
      headers: { "Content-Type": "text/html" },
    }),
    "/client.ts": new Response(clientJs, {
      headers: { "Content-Type": "application/javascript" },
    }),
  },
  
  fetch(req, server) {
    const url = new URL(req.url)

    // Try WebSocket upgrade
    const wsResponse = ws.fetch(req, server)
    if (wsResponse !== null) {
      return wsResponse
    }

    // Health check
    if (url.pathname === "/health") {
      return Response.json({ status: "ok", sessions: ws.sessionManager.getSessionCount() })
    }
    
    return new Response("Not found", { status: 404 })
  },
  
  websocket: ws.websocket,
})

console.log(`
╔══════════════════════════════════════════════════════════════╗
║                   OpenTUI Web Demo                           ║
╠══════════════════════════════════════════════════════════════╣
║  Local:   http://localhost:${server.port}                          ║
║  Network: http://192.168.1.2:${server.port}                        ║
╚══════════════════════════════════════════════════════════════╝
`)
