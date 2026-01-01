import { opentuiWebSocket } from "../src/index"
import html from "./index.html"
import { createRoot, useKeyboard } from "@opentui/react"
import { useState, useEffect } from "react"
import { SyntaxStyle, parseColor, TextAttributes } from "@opentui/core"

// Theme colors
const theme = {
  bg: "#0D1117",
  fg: "#E6EDF3",
  accent: "#4ECDC4",
  border: "#30363D",
  dimmed: "#8B949E",
  success: "#3FB950",
  error: "#F85149",
  warning: "#D29922",
  info: "#58A6FF",
  addedBg: "#1a4d1a",
  removedBg: "#4d1a1a",
}

const syntaxStyle = SyntaxStyle.fromStyles({
  keyword: { fg: parseColor("#FF7B72"), bold: true },
  string: { fg: parseColor("#A5D6FF") },
  comment: { fg: parseColor("#8B949E"), italic: true },
  number: { fg: parseColor("#79C0FF") },
  function: { fg: parseColor("#D2A8FF") },
  type: { fg: parseColor("#FFA657") },
  variable: { fg: parseColor("#E6EDF3") },
  default: { fg: parseColor("#E6EDF3") },
})

const exampleDiff = `--- a/server.ts
+++ b/server.ts
@@ -1,8 +1,12 @@
 import { serve } from "bun";
+import { WebSocket } from "ws";

 const server = serve({
   port: 3000,
-  fetch(req) {
-    return new Response("Hello!");
+  fetch(req, server) {
+    if (server.upgrade(req)) {
+      return;
+    }
+    return new Response("Hello World!");
   },
 });`

const SPINNERS = ["◐", "◓", "◑", "◒"]

const loremLines = [
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
  "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
  "Ut enim ad minim veniam, quis nostrud exercitation ullamco.",
  "Duis aute irure dolor in reprehenderit in voluptate velit.",
  "Excepteur sint occaecat cupidatat non proident.",
  "Sunt in culpa qui officia deserunt mollit anim id est laborum.",
  "Curabitur pretium tincidunt lacus. Nulla gravida orci a odio.",
  "Nullam varius, turpis et commodo pharetra.",
  "Est eros bibendum elit, nec luctus magna felis sollicitudin mauris.",
  "Integer in mauris eu nibh euismod gravida.",
]

type Tab = "overview" | "diff" | "scroll" | "colors"

function Header({ tab, spinner }: { tab: Tab; spinner: string }) {
  return (
    <box flexDirection="row" marginBottom={1}>
      <text bold fg={theme.accent}>
        OpenTUI Web Demo {spinner}
      </text>
      <text fg={theme.dimmed}> | </text>
      <text fg={tab === "overview" ? theme.accent : theme.dimmed}>[1] Overview</text>
      <text fg={theme.dimmed}> </text>
      <text fg={tab === "diff" ? theme.accent : theme.dimmed}>[2] Diff</text>
      <text fg={theme.dimmed}> </text>
      <text fg={tab === "scroll" ? theme.accent : theme.dimmed}>[3] Scroll</text>
      <text fg={theme.dimmed}> </text>
      <text fg={tab === "colors" ? theme.accent : theme.dimmed}>[4] Colors</text>
    </box>
  )
}

function OverviewTab() {
  const [inputValue, setInputValue] = useState("")

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
            <text fg={theme.success}>✓ </text>
            <text fg={theme.fg}>Server running on port 3001</text>
          </box>

          <box border borderStyle="single" borderColor={theme.warning} padding={1} backgroundColor="#2d2206">
            <text fg={theme.warning}>⚠ </text>
            <text fg={theme.fg}>3 pending updates available</text>
          </box>

          <box border borderStyle="single" borderColor={theme.info} padding={1} backgroundColor="#0d1f3c">
            <text fg={theme.info}>ℹ </text>
            <text fg={theme.fg}>Press number keys to switch tabs</text>
          </box>
        </box>
      </box>

      {/* Input area */}
      <box
        marginTop={1}
        border
        borderStyle="rounded"
        borderColor={theme.accent}
        padding={1}
        title="Command Input"
        titleAlignment="left"
        flexDirection="row"
      >
        <text fg={theme.accent}>❯ </text>
        <input
          focused
          placeholder="Type something..."
          onInput={setInputValue}
          style={{ flexGrow: 1, focusedBackgroundColor: theme.bg }}
        />
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

function DiffTab() {
  return (
    <box flexDirection="column" flexGrow={1}>
      <diff
        diff={exampleDiff}
        view="unified"
        filetype="typescript"
        syntaxStyle={syntaxStyle}
        showLineNumbers
        wrapMode="none"
        addedBg={theme.addedBg}
        removedBg={theme.removedBg}
        contextBg="transparent"
        addedSignColor={theme.success}
        removedSignColor={theme.error}
        lineNumberFg={theme.dimmed}
        lineNumberBg="#161b22"
        addedLineNumberBg="#0d3a0d"
        removedLineNumberBg="#3a0d0d"
        selectionBg="#264F78"
        selectionFg="#FFFFFF"
        style={{ flexGrow: 1 }}
      />
    </box>
  )
}

function ScrollTab() {
  return (
    <scrollbox
      style={{
        flexGrow: 1,
        rootOptions: { backgroundColor: theme.bg },
        wrapperOptions: { backgroundColor: theme.bg },
        viewportOptions: { backgroundColor: theme.bg },
        contentOptions: { backgroundColor: theme.bg },
        scrollbarOptions: {
          showArrows: true,
          trackOptions: {
            foregroundColor: theme.accent,
            backgroundColor: theme.border,
          },
        },
      }}
      focused
    >
      {Array.from({ length: 12 }).map((_, i) => {
        const colors = [
          "#1a1b26",
          "#24283b",
          "#292e42",
          "#414868",
          "#2e3440",
          "#3b4252",
        ]
        const borderColors = [theme.accent, theme.success, theme.warning, theme.info, theme.error, "#b48ead"]
        const bg = colors[i % colors.length]
        const borderColor = borderColors[i % borderColors.length]
        const lines = loremLines.slice(0, 2 + (i % 3))

        return (
          <box
            key={i}
            border
            borderStyle="rounded"
            borderColor={borderColor}
            backgroundColor={bg}
            padding={1}
            marginBottom={1}
            title={`Section ${i + 1}`}
          >
            {lines.map((line, j) => (
              <text key={j} fg={theme.fg}>
                {line}
              </text>
            ))}
          </box>
        )
      })}
    </scrollbox>
  )
}

function ColorsTab() {
  const colors = [
    { name: "Red", fg: "#FF6B6B", bg: "#4d1a1a" },
    { name: "Green", fg: "#4ECDC4", bg: "#1a4d4a" },
    { name: "Blue", fg: "#45B7D1", bg: "#1a3d4d" },
    { name: "Yellow", fg: "#F7DC6F", bg: "#4d4a1a" },
    { name: "Purple", fg: "#BB8FCE", bg: "#3d1a4d" },
    { name: "Orange", fg: "#F39C12", bg: "#4d2f0a" },
  ]

  return (
    <box flexDirection="column" flexGrow={1} gap={1}>
      <text bold fg={theme.accent}>
        Color Palette & Text Styles
      </text>

      {/* Color boxes */}
      <box flexDirection="row" gap={1} flexWrap="wrap">
        {colors.map((color) => (
          <box
            key={color.name}
            border
            borderStyle="rounded"
            borderColor={color.fg}
            backgroundColor={color.bg}
            padding={1}
            width={15}
            alignItems="center"
          >
            <text fg={color.fg} bold>
              {color.name}
            </text>
          </box>
        ))}
      </box>

      {/* Text styles */}
      <box
        marginTop={1}
        border
        borderStyle="double"
        borderColor={theme.border}
        padding={1}
        title="Text Formatting"
      >
        <text>
          <strong>Bold</strong>
          <span fg={theme.dimmed}> | </span>
          <em>Italic</em>
          <span fg={theme.dimmed}> | </span>
          <u>Underline</u>
          <span fg={theme.dimmed}> | </span>
          <span fg={theme.dimmed}>Dimmed</span>
        </text>
      </box>

      {/* Gradient-like effect */}
      <box marginTop={1} flexDirection="row">
        <box backgroundColor="#0d2818" width={8} height={3} />
        <box backgroundColor="#1a4d2e" width={8} height={3} />
        <box backgroundColor="#277545" width={8} height={3} />
        <box backgroundColor="#3fb950" width={8} height={3} />
        <box backgroundColor="#56d364" width={8} height={3} />
        <box backgroundColor="#7ee787" width={8} height={3} />
      </box>

      {/* Border styles */}
      <box marginTop={1} flexDirection="row" gap={1}>
        <box border borderStyle="single" padding={1} width={12}>
          <text fg={theme.dimmed}>Single</text>
        </box>
        <box border borderStyle="double" padding={1} width={12}>
          <text fg={theme.dimmed}>Double</text>
        </box>
        <box border borderStyle="rounded" padding={1} width={12}>
          <text fg={theme.dimmed}>Rounded</text>
        </box>
        <box border borderStyle="heavy" padding={1} width={12}>
          <text fg={theme.dimmed}>Heavy</text>
        </box>
      </box>
    </box>
  )
}

function App() {
  const [tab, setTab] = useState<Tab>("overview")
  const [spinnerIdx, setSpinnerIdx] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setSpinnerIdx((i) => (i + 1) % SPINNERS.length)
    }, 100)
    return () => clearInterval(interval)
  }, [])

  useKeyboard((e) => {
    // Only handle specific keys, let others pass through to focused input
    const key = e.name || e.char
    switch (key) {
      case "1":
        setTab("overview")
        break
      case "2":
        setTab("diff")
        break
      case "3":
        setTab("scroll")
        break
      case "4":
        setTab("colors")
        break
      case "q":
        process.exit(0)
        break
      default:
        // Don't handle - let input receive it
        return
    }
    // Prevent default for handled keys
    e.preventDefault?.()
  })

  return (
    <box flexDirection="column" padding={1} backgroundColor={theme.bg}>
      <Header tab={tab} spinner={SPINNERS[spinnerIdx]} />

      {tab === "overview" && <OverviewTab />}
      {tab === "diff" && <DiffTab />}
      {tab === "scroll" && <ScrollTab />}
      {tab === "colors" && <ColorsTab />}
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
  maxRows: 120,
  frameRate: 60,
  onConnection: (session) => {
    console.log(`New session: ${session.id}`)

    const root = createRoot(session.renderer)
    root.render(<App />)

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

  static: {
    "/": html,
    "/client.ts": new Response(clientJs, {
      headers: { "Content-Type": "application/javascript" },
    }),
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
