// Client-side terminal renderer
interface VTermSpan {
  text: string
  fg: string | null
  bg: string | null
  flags: number
  width: number
}

interface VTermLine {
  spans: VTermSpan[]
}

interface VTermData {
  cols: number
  rows: number
  cursor: [number, number]
  offset: number
  totalLines: number
  lines: VTermLine[]
}

interface LineDiff {
  index: number
  line: VTermLine
}

type ServerMessage =
  | { type: "full"; data: VTermData }
  | { type: "diff"; changes: LineDiff[] }
  | { type: "error"; message: string }

// Style flags
const StyleFlags = {
  BOLD: 1,
  ITALIC: 2,
  UNDERLINE: 4,
  STRIKETHROUGH: 8,
  INVERSE: 16,
  FAINT: 32,
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function spanToHtml(span: VTermSpan): string {
  const styles: string[] = []

  if (span.fg) styles.push(`color:${span.fg}`)
  if (span.bg) styles.push(`background-color:${span.bg}`)
  if (span.flags & StyleFlags.BOLD) styles.push("font-weight:bold")
  if (span.flags & StyleFlags.ITALIC) styles.push("font-style:italic")
  if (span.flags & StyleFlags.UNDERLINE) styles.push("text-decoration:underline")
  if (span.flags & StyleFlags.STRIKETHROUGH) styles.push("text-decoration:line-through")
  if (span.flags & StyleFlags.FAINT) styles.push("opacity:0.5")

  const text = escapeHtml(span.text)
  return styles.length ? `<span style="${styles.join(";")}">${text}</span>` : `<span>${text}</span>`
}

function lineToHtml(line: VTermLine): string {
  if (!line || line.spans.length === 0) return "<span>&nbsp;</span>"
  return line.spans.map(spanToHtml).join("")
}

// DOM elements
const terminal = document.getElementById("terminal")!
const statusEl = document.getElementById("status")!

// State
let lines: VTermLine[] = []
let lineElements: HTMLDivElement[] = []

// Connect to WebSocket server
const wsUrl = `ws://${window.location.host}/ws`
const ws = new WebSocket(wsUrl)

ws.onopen = () => {
  console.log("[opentui] Connected")
  statusEl.textContent = "Connected"
  statusEl.className = "connected"
  
  // Send initial resize based on terminal size
  const cols = 80
  const rows = 24
  ws.send(JSON.stringify({ type: "resize", cols, rows }))
}

ws.onclose = () => {
  console.log("[opentui] Disconnected")
  statusEl.textContent = "Disconnected"
  statusEl.className = "disconnected"
}

ws.onerror = (e) => {
  console.error("[opentui] Error:", e)
  statusEl.textContent = "Error"
  statusEl.className = "disconnected"
}

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data) as ServerMessage

  switch (msg.type) {
    case "full":
      renderFull(msg.data)
      break
    case "diff":
      applyDiff(msg.changes)
      break
    case "error":
      console.error("[opentui] Server error:", msg.message)
      break
  }
}

function renderFull(data: VTermData) {
  lines = data.lines
  terminal.innerHTML = ""
  lineElements = []

  for (let i = 0; i < lines.length; i++) {
    const el = document.createElement("div")
    el.className = "line"
    el.innerHTML = lineToHtml(lines[i])
    terminal.appendChild(el)
    lineElements[i] = el
  }
}

function applyDiff(changes: LineDiff[]) {
  for (const { index, line } of changes) {
    lines[index] = line
    
    // Ensure element exists
    while (lineElements.length <= index) {
      const el = document.createElement("div")
      el.className = "line"
      el.innerHTML = "<span>&nbsp;</span>"
      terminal.appendChild(el)
      lineElements.push(el)
    }
    
    lineElements[index].innerHTML = lineToHtml(line)
  }
}

// Keyboard input
terminal.addEventListener("keydown", (e) => {
  e.preventDefault()
  
  if (ws.readyState !== WebSocket.OPEN) return
  
  ws.send(JSON.stringify({
    type: "key",
    key: e.key,
    modifiers: {
      shift: e.shiftKey,
      ctrl: e.ctrlKey,
      alt: e.altKey,
      meta: e.metaKey,
    },
  }))
})

// Focus terminal on click
terminal.addEventListener("click", () => terminal.focus())

// Auto-focus
terminal.focus()
