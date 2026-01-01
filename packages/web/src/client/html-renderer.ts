import type { VTermData, VTermLine, VTermSpan, LineDiff } from "../shared/types"

const DEFAULT_BG = "#1e1e1e"
const DEFAULT_FONT_SIZE = 14
const DEFAULT_MAX_COLS = 200
const DEFAULT_MAX_ROWS = 200

/** Font metrics for calculating terminal dimensions */
export interface TerminalMetrics {
  charWidth: number
  lineHeight: number
}

/** Get font metrics for a given font size */
export function getTerminalMetrics(options?: { fontSize?: number }): TerminalMetrics {
  const fontSize = options?.fontSize ?? DEFAULT_FONT_SIZE
  return {
    charWidth: fontSize * 0.6,
    lineHeight: fontSize * 1.2,
  }
}

/** Calculate cols/rows that fit in given pixel dimensions */
export function getTerminalSize(options: {
  width: number
  height: number
  fontSize?: number
  maxCols?: number
  maxRows?: number
}): { cols: number; rows: number } {
  const {
    width,
    height,
    fontSize = DEFAULT_FONT_SIZE,
    maxCols = DEFAULT_MAX_COLS,
    maxRows = DEFAULT_MAX_ROWS,
  } = options
  const metrics = getTerminalMetrics({ fontSize })
  return {
    cols: Math.min(Math.floor(width / metrics.charWidth), maxCols),
    rows: Math.min(Math.floor(height / metrics.lineHeight), maxRows),
  }
}

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
    return "<span>&nbsp;</span>"
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
  /** Called when terminal size changes due to window resize */
  onResize?: (size: { cols: number; rows: number }) => void
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
  private fontFamily: string
  private onResize?: (size: { cols: number; rows: number }) => void
  private resizeTimeout: ReturnType<typeof setTimeout> | null = null
  private boundHandleResize: () => void

  constructor(options: TerminalRendererOptions) {
    this.container = options.container
    this.maxCols = options.maxCols ?? DEFAULT_MAX_COLS
    this.maxRows = options.maxRows ?? DEFAULT_MAX_ROWS
    this.fontSize = options.fontSize ?? DEFAULT_FONT_SIZE
    this.fixedBackground = options.backgroundColor ?? null
    this.fontFamily = options.fontFamily ?? "Monaco, Menlo, 'Ubuntu Mono', Consolas, monospace"
    this.onResize = options.onResize

    // Calculate initial size based on window dimensions
    this.recalculateSize()

    // Create terminal container with computed size
    this.terminalEl = document.createElement("div")
    this.terminalEl.className = "opentui-terminal"
    this.updateTerminalStyles()

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

    // Setup resize listener with 10ms debounce
    this.boundHandleResize = this.handleResize.bind(this)
    window.addEventListener("resize", this.boundHandleResize)
  }

  private recalculateSize() {
    const metrics = getTerminalMetrics({ fontSize: this.fontSize })

    // Calculate what fits on the page
    const pageCols = Math.floor(window.innerWidth / metrics.charWidth)
    const pageRows = Math.floor(window.innerHeight / metrics.lineHeight)

    // Use minimum of user's max and what fits on page
    this.cols = Math.min(this.maxCols, pageCols)
    this.rows = Math.min(this.maxRows, pageRows)
  }

  private updateTerminalStyles() {
    const metrics = getTerminalMetrics({ fontSize: this.fontSize })
    const width = this.cols * metrics.charWidth
    const height = this.rows * metrics.lineHeight
    const maxWidth = this.maxCols * metrics.charWidth
    const maxHeight = this.maxRows * metrics.lineHeight

    this.terminalEl.style.cssText = `
      font-family: ${this.fontFamily};
      font-size: ${this.fontSize}px;
      line-height: 1.2;
      background-color: ${this.fixedBackground ?? "transparent"};
      color: #ffffff;
      overflow: hidden;
      position: relative;
      width: ${width}px;
      height: ${height}px;
      max-width: ${maxWidth}px;
      max-height: ${maxHeight}px;
    `
  }

  private handleResize() {
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout)
    }
    this.resizeTimeout = setTimeout(() => {
      const oldCols = this.cols
      const oldRows = this.rows
      this.recalculateSize()

      if (oldCols !== this.cols || oldRows !== this.rows) {
        this.updateTerminalStyles()
        this.onResize?.({ cols: this.cols, rows: this.rows })
      }
    }, 10)
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
    this.updateCursor(data.cursor[0], data.cursor[1], data.cursorVisible)
  }

  applyDiff(changes: LineDiff[]) {
    for (const { index, line } of changes) {
      // Ensure we have enough line elements
      while (this.lineElements.length <= index) {
        const lineEl = document.createElement("div")
        lineEl.className = "opentui-line"
        lineEl.style.cssText = "white-space: pre; height: 1.2em;"
        lineEl.dataset.line = String(this.lineElements.length)
        lineEl.innerHTML = "<span>&nbsp;</span>"
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

    // Convert from 1-based terminal coordinates to 0-based CSS positioning
    const cssX = x - 1
    const cssY = y - 1

    this.cursorEl.style.display = "block"
    this.cursorEl.style.left = `${cssX}ch`
    this.cursorEl.style.top = `${cssY * 1.2}em`
  }

  getSize(): { cols: number; rows: number } {
    return { cols: this.cols, rows: this.rows }
  }

  destroy() {
    window.removeEventListener("resize", this.boundHandleResize)
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout)
    }
    this.container.removeChild(this.terminalEl)
  }
}
