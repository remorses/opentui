import type { VTermData, VTermLine, VTermSpan, LineDiff } from "../shared/types"
import { measureCellSize } from "./measure"

const DEFAULT_BG = "#1e1e1e"
const DEFAULT_FONT_SIZE = 14

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
  fontFamily?: string
  fontSize?: number
  /** Line height multiplier (default: 1.2) */
  lineHeight?: number
  backgroundColor?: string
  textColor?: string
}

export class TerminalRenderer {
  private container: HTMLElement
  private terminalEl: HTMLDivElement
  private lineElements: HTMLDivElement[] = []
  private cursorEl: HTMLDivElement
  private fontSize: number
  private lineHeightMultiplier: number
  private cols: number = 80
  private rows: number = 24
  private backgroundColor: string
  private fontFamily: string
  public readonly metrics: { charWidth: number; cellHeight: number }

  constructor(options: TerminalRendererOptions) {
    this.container = options.container
    this.fontSize = options.fontSize ?? DEFAULT_FONT_SIZE
    this.lineHeightMultiplier = options.lineHeight ?? 1.2
    this.backgroundColor = options.backgroundColor ?? DEFAULT_BG
    this.fontFamily = options.fontFamily ?? "Monaco, Menlo, 'Ubuntu Mono', Consolas, monospace"

    // Measure cell size
    const cellSize = measureCellSize({
      fontSize: this.fontSize,
      fontFamily: this.fontFamily,
      lineHeight: this.lineHeightMultiplier,
    })
    this.metrics = { charWidth: cellSize.width, cellHeight: cellSize.height }

    // Calculate initial size from container
    this.recalculateSize()

    // Create terminal container
    this.terminalEl = document.createElement("div")
    this.terminalEl.className = "opentui-terminal"
    this.updateTerminalStyles()

    // Create cursor element
    this.cursorEl = document.createElement("div")
    this.cursorEl.className = "opentui-cursor"
    this.cursorEl.style.cssText = `
      position: absolute;
      width: 1ch;
      height: ${this.metrics.cellHeight}px;
      background-color: rgba(255, 255, 255, 0.7);
      pointer-events: none;
      display: none;
      animation: opentui-blink 1s step-end infinite;
    `

    this.container.appendChild(this.terminalEl)
    this.terminalEl.appendChild(this.cursorEl)

    // Inject scoped styles
    this.injectStyles()
  }

  private recalculateSize(): void {
    const containerWidth = this.container.clientWidth
    const containerHeight = this.container.clientHeight

    this.cols = Math.floor(containerWidth / this.metrics.charWidth)
    this.rows = Math.floor(containerHeight / this.metrics.cellHeight)

    // Ensure at least 1x1
    this.cols = Math.max(1, this.cols)
    this.rows = Math.max(1, this.rows)
  }

  private updateTerminalStyles(): void {
    const width = this.cols * this.metrics.charWidth
    const height = this.rows * this.metrics.cellHeight

    this.terminalEl.style.cssText = `
      font-family: ${this.fontFamily};
      font-size: ${this.fontSize}px;
      line-height: ${this.lineHeightMultiplier};
      background-color: ${this.backgroundColor};
      color: #ffffff;
      overflow: hidden;
      position: relative;
      width: ${width}px;
      height: ${height}px;
    `
  }

  /** Recalculate size from container and update. Call this after container resizes. */
  resize(): { cols: number; rows: number } {
    this.recalculateSize()
    this.updateTerminalStyles()
    return { cols: this.cols, rows: this.rows }
  }

  private injectStyles(): void {
    // Check if styles already exist in this container
    if (this.terminalEl.querySelector("style")) return

    const style = document.createElement("style")
    style.textContent = `
      .opentui-line {
        white-space: pre;
        height: ${this.metrics.cellHeight}px;
      }
      .opentui-line span {
        white-space: pre;
      }
      @keyframes opentui-blink {
        50% { opacity: 0; }
      }
    `
    this.terminalEl.appendChild(style)
  }

  renderFull(data: VTermData) {
    this.cols = data.cols
    this.rows = data.rows
    this.updateTerminalStyles()

    // Clear existing lines (preserve cursor and style)
    const style = this.terminalEl.querySelector("style")
    this.lineElements = []
    this.terminalEl.innerHTML = ""
    if (style) this.terminalEl.appendChild(style)
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

  setSelection(anchor: { x: number; y: number }, focus: { x: number; y: number }): void {
    // Normalize to start/end (anchor could be after focus if selecting backwards)
    const startY = Math.min(anchor.y, focus.y)
    const endY = Math.max(anchor.y, focus.y)
    const startX = anchor.y < focus.y ? anchor.x : anchor.y > focus.y ? focus.x : Math.min(anchor.x, focus.x)
    const endX = anchor.y < focus.y ? focus.x : anchor.y > focus.y ? anchor.x : Math.max(anchor.x, focus.x)

    const startLine = this.lineElements[startY]
    const endLine = this.lineElements[endY]
    if (!startLine || !endLine) return

    const selection = window.getSelection()
    if (!selection) return

    selection.removeAllRanges()

    const range = document.createRange()
    const startNode = this.getTextNodeAtColumn(startLine, startX)
    const endNode = this.getTextNodeAtColumn(endLine, endX)

    if (startNode && endNode) {
      range.setStart(startNode.node, startNode.offset)
      range.setEnd(endNode.node, endNode.offset)
      selection.addRange(range)
    }
  }

  clearSelection(): void {
    window.getSelection()?.removeAllRanges()
  }

  private getTextNodeAtColumn(lineEl: HTMLDivElement, col: number): { node: Text; offset: number } | null {
    const walker = document.createTreeWalker(lineEl, NodeFilter.SHOW_TEXT)
    let currentCol = 0
    let node: Text | null

    while ((node = walker.nextNode() as Text | null)) {
      const text = node.textContent || ""
      if (currentCol + text.length >= col) {
        return { node, offset: Math.min(col - currentCol, text.length) }
      }
      currentCol += text.length
    }

    // Return last text node if col is beyond content
    const lastNode = walker.currentNode as Text
    if (lastNode?.nodeType === Node.TEXT_NODE) {
      return { node: lastNode, offset: lastNode.textContent?.length || 0 }
    }
    return null
  }

  destroy(): void {
    this.container.removeChild(this.terminalEl)
  }
}
