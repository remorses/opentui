import { opentuiWebSocket } from "../../src/index"
import html from "./index.html"
import { createRoot } from "@opentui/react"
import { App, theme } from "../components"

function OverviewTab() {
  return (
    <box flexDirection="column" flexGrow={1}>
      <box flexDirection="row" gap={2}>
        {/* Left column - Stats */}
        <box
          flexDirection="column"
          border
          borderStyle="rounded"
          borderColor={theme.border}
          padding={1}
          width={30}
          title="System Stats"
        >
          <box flexDirection="row" justifyContent="space-between">
            <text fg={theme.dimmed}>CPU</text>
            <text fg={theme.success}>45%</text>
          </box>
          <box backgroundColor={theme.border} height={1}>
            <box backgroundColor={theme.success} width="45%" height={1} />
          </box>

          <box flexDirection="row" justifyContent="space-between" marginTop={1}>
            <text fg={theme.dimmed}>Memory</text>
            <text fg={theme.warning}>72%</text>
          </box>
          <box backgroundColor={theme.border} height={1}>
            <box backgroundColor={theme.warning} width="72%" height={1} />
          </box>

          <box flexDirection="row" justifyContent="space-between" marginTop={1}>
            <text fg={theme.dimmed}>Disk</text>
            <text fg={theme.info}>38%</text>
          </box>
          <box backgroundColor={theme.border} height={1}>
            <box backgroundColor={theme.info} width="38%" height={1} />
          </box>
        </box>

        {/* Right column - Info boxes */}
        <box flexDirection="column" flexGrow={1} gap={1}>
          <box border borderStyle="single" borderColor={theme.success} padding={1} backgroundColor="#0d2818">
            <text fg={theme.success}>[OK] </text>
            <text fg={theme.fg}>Server running on port 3001</text>
          </box>

          <box border borderStyle="single" borderColor={theme.warning} padding={1} backgroundColor="#2d2206">
            <text fg={theme.warning}>[!!] </text>
            <text fg={theme.fg}>3 pending updates available</text>
          </box>

          <box border borderStyle="single" borderColor={theme.info} padding={1} backgroundColor="#0d1f3c">
            <text fg={theme.info}>[i] </text>
            <text fg={theme.fg}>Press number keys to switch tabs</text>
          </box>
        </box>
      </box>

      {/* Text editor area */}
      <box
        marginTop={1}
        border
        borderStyle="rounded"
        borderColor={theme.accent}
        padding={1}
        title="Text Editor"
        titleAlignment="left"
        height={5}
      >
        <textarea focused initialValue="hello world test" style={{ flexGrow: 1, backgroundColor: theme.bg }} />
      </box>

      {/* Keyboard hints */}
      <box marginTop={1} flexDirection="row" gap={2}>
        <text fg={theme.dimmed}>Keys: </text>
        <text>
          <span fg={theme.accent}>1-4</span>
          <span fg={theme.dimmed}> tabs</span>
        </text>
        <text>
          <span fg={theme.accent}>↑↓</span>
          <span fg={theme.dimmed}> scroll</span>
        </text>
        <text>
          <span fg={theme.accent}>q</span>
          <span fg={theme.dimmed}> quit</span>
        </text>
      </box>
    </box>
  )
}

// Create WebSocket handler
const ws = opentuiWebSocket({
  maxCols: 120,
  maxRows: 40,
  frameRate: 60,
  onConnection: (session) => {
    console.log(`New session: ${session.id}`)

    const root = createRoot(session.renderer)
    root.render(<App title="OpenTUI Web Demo" overviewTab={<OverviewTab />} />)

    return () => {
      console.log(`Session closed: ${session.id}`)
      root.unmount()
    }
  },
})

// Start server
const server = Bun.serve({
  port: 3001,
  hostname: "0.0.0.0",

  // @ts-expect-error - Bun's static option is not in the type definitions yet
  static: {
    "/": html,
  },

  fetch(req, server) {
    const url = new URL(req.url)

    const wsResponse = ws.fetch(req, server)
    if (wsResponse !== null) {
      return wsResponse
    }

    if (url.pathname === "/health") {
      return Response.json({ status: "ok", sessions: ws.sessionManager.getSessionCount() })
    }

    return new Response("Not found", { status: 404 })
  },

  websocket: ws.websocket,
})

console.log(`OpenTUI Web Demo running at http://localhost:${server.port}`)
