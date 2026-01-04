/**
 * Spawn a terminal in a shared namespace via the tunnel.
 *
 * Usage:
 *   bun demo/grid/spawn.tsx                    # Spawn with random ID in "grid-demo" namespace
 *   bun demo/grid/spawn.tsx --id term-1        # Spawn with specific ID
 *   bun demo/grid/spawn.tsx --namespace myns   # Use custom namespace
 *
 * Multiple spawn.tsx processes with the same namespace will appear in the grid client.
 */

import { connectTunnelServer } from "../../src/server/tunnel"
import { createRoot } from "@opentui/react"
import { App, theme, Tab } from "../components"

// Parse CLI args
const args = process.argv.slice(2)
const getArg = (name: string): string | undefined => {
  const idx = args.indexOf(`--${name}`)
  return idx !== -1 ? args[idx + 1] : undefined
}

const namespace = getArg("namespace") || "grid-demo"
const tunnelId = getArg("id") || `term-${Math.random().toString(36).slice(2, 8)}`

// Different content based on terminal ID for variety
const terminalConfigs: Record<string, { title: string; defaultTab: Tab }> = {
  "term-1": { title: "Terminal 1", defaultTab: "overview" },
  "term-2": { title: "Terminal 2", defaultTab: "diff" },
  "term-3": { title: "Terminal 3", defaultTab: "scroll" },
  "term-4": { title: "Terminal 4", defaultTab: "colors" },
}

const config = terminalConfigs[tunnelId] || {
  title: `Terminal ${tunnelId}`,
  defaultTab: "diff" as Tab,
}

function OverviewTab() {
  return (
    <box flexDirection="column" flexGrow={1}>
      <box flexDirection="row" gap={2}>
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
            <text fg={theme.success}>{Math.floor(Math.random() * 60 + 20)}%</text>
          </box>
          <box backgroundColor={theme.border} height={1}>
            <box backgroundColor={theme.success} width="45%" height={1} />
          </box>

          <box flexDirection="row" justifyContent="space-between" marginTop={1}>
            <text fg={theme.dimmed}>Memory</text>
            <text fg={theme.warning}>{Math.floor(Math.random() * 40 + 40)}%</text>
          </box>
          <box backgroundColor={theme.border} height={1}>
            <box backgroundColor={theme.warning} width="72%" height={1} />
          </box>

          <box flexDirection="row" justifyContent="space-between" marginTop={1}>
            <text fg={theme.dimmed}>Disk</text>
            <text fg={theme.info}>{Math.floor(Math.random() * 30 + 20)}%</text>
          </box>
          <box backgroundColor={theme.border} height={1}>
            <box backgroundColor={theme.info} width="38%" height={1} />
          </box>
        </box>

        <box flexDirection="column" flexGrow={1} gap={1}>
          <box border borderStyle="single" borderColor={theme.success} padding={1} backgroundColor="#0d2818">
            <text fg={theme.success}>[OK] </text>
            <text fg={theme.fg}>Terminal {tunnelId} active</text>
          </box>

          <box border borderStyle="single" borderColor={theme.warning} padding={1} backgroundColor="#2d2206">
            <text fg={theme.warning}>[!!] </text>
            <text fg={theme.fg}>Namespace: {namespace}</text>
          </box>

          <box border borderStyle="single" borderColor={theme.info} padding={1} backgroundColor="#0d1f3c">
            <text fg={theme.info}>[i] </text>
            <text fg={theme.fg}>Press 1-4 to switch tabs</text>
          </box>
        </box>
      </box>

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
        <textarea focused initialValue={`Hello from ${tunnelId}!`} style={{ flexGrow: 1, backgroundColor: theme.bg }} />
      </box>

      <box marginTop={1} flexDirection="row" gap={2}>
        <text fg={theme.dimmed}>Keys: </text>
        <text>
          <span fg={theme.accent}>1-4</span>
          <span fg={theme.dimmed}> tabs</span>
        </text>
        <text>
          <span fg={theme.accent}>q</span>
          <span fg={theme.dimmed}> quit</span>
        </text>
      </box>
    </box>
  )
}

console.log(`Spawning terminal: ${tunnelId} in namespace: ${namespace}`)

connectTunnelServer({
  namespace,
  tunnelId,
  maxCols: 120,
  maxRows: 40,
  frameRate: 60,
  onConnection: (session) => {
    console.log(`Browser connected to ${tunnelId}`)

    const root = createRoot(session.renderer)
    root.render(<App title={config.title} overviewTab={<OverviewTab />} />)

    return () => {
      console.log(`Browser disconnected from ${tunnelId}`)
      root.unmount()
    }
  },
  onReady: (info) => {
    console.log(`\nTerminal ready!`)
    console.log(`  ID: ${info.tunnelId}`)
    console.log(`  Namespace: ${info.namespace}`)
    console.log(`  Direct URL: ${info.htmlUrl}`)
    console.log(`\nTo view in grid: open grid.html with namespace=${namespace}`)
  },
  onDisconnect: () => {
    console.log("Disconnected from tunnel")
    process.exit(0)
  },
  onError: (error) => {
    console.error("Tunnel error:", error.message)
    process.exit(1)
  },
})
