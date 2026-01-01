import type { VTermData, VTermLine, VTermSpan, LineDiff } from "../shared/types"

const DEFAULT_BG = "#1e1e1e"

function getMostCommonBackground(data: VTermData): string {
  const bgCounts = new Map<string, number>()

  for (const line of data.lines) {
    for (const span of line.spans) {
      const bg = span.bg || ""
      if (!bg || bg === "#00000000" || bg === "transparent") continue
      const count = bgCounts.get(bg) || 0
      bgCounts.set(bg, count + span.text.length)
    }
  }

  let maxBg = ""
  let maxCount = 0
  for (const [bg, count] of bgCounts) {
    if (count > maxCount) {
      maxCount = count
      maxBg = bg
    }
  }

  return maxBg || DEFAULT_BG
}

// Style flags matching VTermStyleFlags from core
const StyleFlags = {
  BOLD: 1,
  ITALIC: 2,
  UNDERLINE: 4,
  STRIKETHROUGH: 8,
  INVERSE: 16,
  FAINT: 32,
} as const

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function spanToHtml(span: VTermSpan): string {
  const styles: string[] = []

  if (span.fg) {
    styles.push(`color:${span.fg}`)
  }
  if (span.bg) {
    styles.push(`background-color:${span.bg}`)
  }

  if (span.flags & StyleFlags.BOLD) {
    styles.push("font-weight:bold")
  }
  if (span.flags & StyleFlags.ITALIC) {
    styles.push("font-style:italic")
  }
  if (span.flags & StyleFlags.UNDERLINE) {
    styles.push("text-decoration:underline")
  }
  if (span.flags & StyleFlags.STRIKETHROUGH) {
    styles.push("text-decoration:line-through")
  }
  if (span.flags & StyleFlags.FAINT) {
    styles.push("opacity:0.5")
  }

  const escapedText = escapeHtml(span.text)

  if (styles.length === 0) {
    return `<span>${escapedText}</span>`
  }

  return `<span style="${styles.join(";")}">${escapedText}</span>`
}

function lineToHtml(line: VTermLine): string {
  if (line.spans.length === 0) {
    return '<span>&nbsp;</span>'
  }
  return line.spans.map(spanToHtml).join("")
}

export interface TerminalRendererOptions {
  container: HTMLElement
  /** Maximum columns (default 200) */
  maxCols?: number
  /** Maximum rows (default 200) */
  maxRows?: number
  fontFamily?: string
  fontSize?: number
  /** If not provided, auto-detects from terminal content */
  backgroundColor?: string
  textColor?: string
}

export class TerminalRenderer {
  private container: HTMLElement
  private terminalEl: HTMLDivElement
  private lineElements: HTMLDivElement[] = []
  private cursorEl: HTMLDivElement
  private maxCols: number
  private maxRows: number
  private fontSize: number
  private cols: number = 80
  private rows: number = 24
  private fixedBackground: string | null

  constructor(options: TerminalRendererOptions) {
    this.container = options.container
    this.maxCols = options.maxCols ?? 200
    this.maxRows = options.maxRows ?? 200
    this.fontSize = options.fontSize ?? 14
    this.fixedBackground = options.backgroundColor ?? null

    // Create terminal container
    // Use provided background or transparent (will auto-detect on first render)
    this.terminalEl = document.createElement("div")
    this.terminalEl.className = "opentui-terminal"
    this.terminalEl.style.cssText = `
      font-family: ${options.fontFamily ?? "Monaco, Menlo, 'Ubuntu Mono', Consolas, monospace"};
      font-size: ${this.fontSize}px;
      line-height: 1.2;
      background-color: ${this.fixedBackground ?? "transparent"};
      color: ${options.textColor ?? "#ffffff"};
      overflow: hidden;
      position: relative;
      width: 100%;
      height: 100%;
    `

    // Create cursor element
    this.cursorEl = document.createElement("div")
    this.cursorEl.className = "opentui-cursor"
    this.cursorEl.style.cssText = `
      position: absolute;
      width: 1ch;
      height: 1.2em;
      background-color: rgba(255, 255, 255, 0.7);
      pointer-events: none;
      display: none;
    `

    this.container.appendChild(this.terminalEl)
    this.terminalEl.appendChild(this.cursorEl)

    // Add global styles
    this.injectStyles()
  }

  private injectStyles() {
    if (document.getElementById("opentui-styles")) return

    const style = document.createElement("style")
    style.id = "opentui-styles"
    style.textContent = `
      .opentui-terminal {
        -webkit-text-size-adjust: 100%;
        text-size-adjust: 100%;
      }
      .opentui-line {
        white-space: pre;
        height: 1.2em;
      }
      .opentui-line span {
        white-space: pre;
      }
      .opentui-cursor {
        animation: opentui-blink 1s step-end infinite;
      }
      @keyframes opentui-blink {
        50% { opacity: 0; }
      }
    `
    document.head.appendChild(style)
  }

  renderFull(data: VTermData) {
    this.cols = data.cols
    this.rows = data.rows

    // Auto-detect background from terminal content (only if not user-provided)
    if (!this.fixedBackground) {
      const bg = getMostCommonBackground(data)
      document.body.style.backgroundColor = bg
      this.terminalEl.style.backgroundColor = bg
      this.fixedBackground = bg // only detect once
    }

    // Clear existing lines
    this.lineElements = []
    this.terminalEl.innerHTML = ""
    this.terminalEl.appendChild(this.cursorEl)

    // Render all lines
    for (let i = 0; i < data.lines.length; i++) {
      const lineEl = document.createElement("div")
      lineEl.className = "opentui-line"
      lineEl.style.cssText = "white-space: pre; height: 1.2em;"
      lineEl.dataset.line = String(i)
      lineEl.innerHTML = lineToHtml(data.lines[i])
      this.terminalEl.appendChild(lineEl)
      this.lineElements[i] = lineEl
    }

    // Update cursor
    this.updateCursor(data.cursor[0], data.cursor[1], true)
  }

  applyDiff(changes: LineDiff[]) {
    for (const { index, line } of changes) {
      // Ensure we have enough line elements
      while (this.lineElements.length <= index) {
        const lineEl = document.createElement("div")
        lineEl.className = "opentui-line"
        lineEl.style.cssText = "white-space: pre; height: 1.2em;"
        lineEl.dataset.line = String(this.lineElements.length)
        lineEl.innerHTML = '<span>&nbsp;</span>'
        this.terminalEl.appendChild(lineEl)
        this.lineElements.push(lineEl)
      }

      // Update the line content
      this.lineElements[index].innerHTML = lineToHtml(line)
    }
  }

  updateCursor(x: number, y: number, visible: boolean) {
    if (!visible) {
      this.cursorEl.style.display = "none"
      return
    }

    this.cursorEl.style.display = "block"
    this.cursorEl.style.left = `${x}ch`
    this.cursorEl.style.top = `${y * 1.2}em`
  }

  getSize(): { cols: number; rows: number } {
    const charWidth = this.fontSize * 0.6
    const lineHeight = this.fontSize * 1.2

    const cols = Math.min(Math.floor(this.container.clientWidth / charWidth), this.maxCols)
    const rows = Math.min(Math.floor(this.container.clientHeight / lineHeight), this.maxRows)

    return { cols, rows }
  }

  destroy() {
    this.container.removeChild(this.terminalEl)
  }
}
