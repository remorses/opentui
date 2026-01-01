import { opentuiWebSocket } from "../src/index"
import html from "./index.html"
import { createRoot, useKeyboard } from "@opentui/react"
import { useState, useEffect } from "react"

const SPINNERS = {
  dots: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  line: ["-", "\\", "|", "/"],
  circle: ["◐", "◓", "◑", "◒"],
  bounce: ["⠁", "⠂", "⠄", "⠂"],
  box: ["▖", "▘", "▝", "▗"],
  arrows: ["←", "↖", "↑", "↗", "→", "↘", "↓", "↙"],
}

// Simple counter app component
function CounterApp() {
  const [count, setCount] = useState(0)
  const [message, setMessage] = useState("Press +/-/arrows, r to reset")
  const [spinnerIdx, setSpinnerIdx] = useState(0)
  const [fps, setFps] = useState(0)
  const spinner = SPINNERS.circle

  // Spinner animation at reasonable speed, FPS counter separate
  useEffect(() => {
    let frameCount = 0
    let lastFpsUpdate = Date.now()

    // Spinner updates at 100ms (10 fps) - visually reasonable
    const spinnerInterval = setInterval(() => {
      setSpinnerIdx((i) => (i + 1) % spinner.length)
    }, 100)

    // FPS counter updates every 16ms to measure actual render rate
    const fpsInterval = setInterval(() => {
      frameCount++
      const now = Date.now()
      if (now - lastFpsUpdate >= 1000) {
        setFps(frameCount)
        frameCount = 0
        lastFpsUpdate = now
      }
    }, 16)

    return () => {
      clearInterval(spinnerInterval)
      clearInterval(fpsInterval)
    }
  }, [])

  useKeyboard((e) => {
    console.log(`[key] name="${e.name}" char="${e.char}"`)

    const key = e.name || e.char
    if (key === "+" || key === "=" || key === "up") {
      setCount((c) => c + 1)
    } else if (key === "-" || key === "_" || key === "down") {
      setCount((c) => c - 1)
    } else if (key === "r") {
      setCount(0)
      setMessage("Counter reset!")
      setTimeout(() => setMessage("Press +/-/arrows, r to reset"), 2000)
    } else if (key === "q") {
      process.exit(0)
    }
  })

  return (
    <box flexDirection="column" padding={1}>
      <box marginBottom={1}>
        <text bold fg="#4ECDC4">
          OpenTUI Web Demo {spinner[spinnerIdx]}
        </text>
        <text fg="#666"> {fps} fps</text>
      </box>

      <box borderStyle="single" borderColor="#888" padding={1} flexDirection="column" alignItems="center" width={40}>
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
        <text fg="#666"> +/-/↑/↓ : Increment / Decrement</text>
        <text fg="#666"> r : Reset</text>
        <text fg="#666"> q : Quit server</text>
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
    "/": html,
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
console.log(`OpenTUI Web Demo running on:
  Local:   http://localhost:${server.port}
`)
