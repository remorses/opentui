/**
 * Canvas-based Terminal Renderer
 *
 * Renders terminal content to a canvas element with:
 * - Custom glyph rendering for box-drawing characters (pixel-perfect lines)
 * - Hidden text layer for native browser text selection/copy
 * - High-DPI support
 */

import type { VTermData, VTermLine, VTermSpan } from "../shared/types"
import { customGlyphDefinitions, drawPath, drawBlocks, type GlyphDefinition } from "./custom-glyphs"
import { measureCellSize } from "./measure"

const DEFAULT_BG = "#1e1e1e"
const DEFAULT_FG = "#d4d4d4"
const DEFAULT_FONT_SIZE = 14
const DEFAULT_LINE_HEIGHT = 1.2

// Style flags matching VTermStyleFlags from core
const StyleFlags = {
  BOLD: 1,
  ITALIC: 2,
  UNDERLINE: 4,
  STRIKETHROUGH: 8,
  INVERSE: 16,
  FAINT: 32,
} as const

export interface CanvasRendererOptions {
  container: HTMLElement
  fontFamily?: string
  fontSize?: number
  /** Line height multiplier (default: 1.2) */
  lineHeight?: number
  /** Font weight for normal text (default: 500). Can be string or number (100-900) */
  fontWeight?: string | number
  /** Font weight for bold text (default: "bold"). Can be string or number (100-900) */
  fontWeightBold?: string | number
  /** Letter spacing in pixels (default: 0) */
  letterSpacing?: number
  backgroundColor?: string
  textColor?: string
  devicePixelRatio?: number
  /** Whether the terminal is focused (default: true). Controls cursor visibility. */
  focused?: boolean
}

export interface FontMetrics {
  charWidth: number
  /** Cell height (with line height applied) */
  cellHeight: number
  /** Baseline offset from top of cell (for vertical centering) */
  baseline: number
}

export class CanvasRenderer {
  private container: HTMLElement
  private wrapper: HTMLDivElement
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private textLayer: HTMLDivElement // Hidden layer for text selection
  private cursorEl: HTMLDivElement

  private fontSize: number
  private lineHeightMultiplier: number
  private fontFamily: string
  private fontWeight: string | number
  private fontWeightBold: string | number
  private letterSpacing: number
  private backgroundColor: string
  private textColor: string
  private dpr: number
  private textBaseline: CanvasTextBaseline

  private cols: number = 80
  private rows: number = 24
  public readonly metrics: FontMetrics

  // Cursor blink state
  private cursorBlinkInterval: ReturnType<typeof setInterval> | null = null
  private cursorBlinkVisible: boolean = true
  private lastCursorX: number = 0
  private lastCursorY: number = 0
  private focused: boolean = true

  constructor(options: CanvasRendererOptions) {
    this.container = options.container
    this.fontSize = options.fontSize ?? DEFAULT_FONT_SIZE
    this.lineHeightMultiplier = options.lineHeight ?? DEFAULT_LINE_HEIGHT
    this.fontFamily =
      options.fontFamily ??
      "ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono', monospace"
    this.fontWeight = options.fontWeight ?? 500
    this.fontWeightBold = options.fontWeightBold ?? "bold"
    this.letterSpacing = options.letterSpacing ?? 0
    this.backgroundColor = options.backgroundColor ?? DEFAULT_BG
    this.textColor = options.textColor ?? DEFAULT_FG
    this.dpr = options.devicePixelRatio ?? window.devicePixelRatio ?? 1
    this.focused = options.focused ?? true

    // Use 'alphabetic' baseline - most standard and predictable
    this.textBaseline = "alphabetic"

    // Measure font metrics using shared utility
    const cellSize = measureCellSize({
      fontSize: this.fontSize,
      fontFamily: this.fontFamily,
      lineHeight: this.lineHeightMultiplier,
      letterSpacing: this.letterSpacing,
    })
    this.metrics = this.measureFont(cellSize)

    // Calculate initial size from container
    this.recalculateSize()

    // Create wrapper div
    this.wrapper = document.createElement("div")
    this.wrapper.className = "opentui-canvas-wrapper"
    this.wrapper.style.cssText = `
      position: relative;
      width: ${this.cols * this.metrics.charWidth}px;
      height: ${this.rows * this.metrics.cellHeight}px;
      background-color: ${this.backgroundColor};
      overflow: hidden;
    `

    // Create canvas (renders visuals, behind text layer for selection to work)
    this.canvas = document.createElement("canvas")
    this.canvas.className = "opentui-canvas"
    this.canvas.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: ${this.cols * this.metrics.charWidth}px;
      height: ${this.rows * this.metrics.cellHeight}px;
      pointer-events: none;
      z-index: 1;
    `

    // Create text layer for selection (on top, transparent text so canvas shows through)
    this.textLayer = document.createElement("div")
    this.textLayer.className = "opentui-text-layer"
    this.textLayer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      font-family: ${this.fontFamily};
      font-size: ${this.fontSize}px;
      font-weight: ${this.fontWeight};
      line-height: ${this.metrics.cellHeight}px;
      letter-spacing: ${this.letterSpacing}px;
      color: transparent;
      white-space: pre;
      user-select: text;
      -webkit-user-select: text;
      cursor: text;
      z-index: 2;
      font-variant-ligatures: none;
      font-kerning: none;
      text-rendering: optimizeSpeed;
      -webkit-font-smoothing: antialiased;
    `

    // Set canvas size for high-DPI
    this.canvas.width = this.cols * this.metrics.charWidth * this.dpr
    this.canvas.height = this.rows * this.metrics.cellHeight * this.dpr

    const ctx = this.canvas.getContext("2d", { alpha: false })
    if (!ctx) {
      throw new Error("Failed to get 2D rendering context")
    }
    this.ctx = ctx
    this.ctx.scale(this.dpr, this.dpr)

    // Create cursor element
    this.cursorEl = document.createElement("div")
    this.cursorEl.className = "opentui-cursor"
    this.cursorEl.style.cssText = `
      position: absolute;
      width: ${this.metrics.charWidth}px;
      height: ${this.metrics.cellHeight}px;
      background-color: white;
      mix-blend-mode: difference;
      pointer-events: none;
      display: none;
      z-index: 3;
    `

    // Assemble DOM
    this.wrapper.appendChild(this.textLayer)
    this.wrapper.appendChild(this.canvas)
    this.wrapper.appendChild(this.cursorEl)
    this.container.appendChild(this.wrapper)

    // Inject scoped styles
    this.injectStyles()

    // Initial clear
    this.clear()
  }

  private measureFont(cellSize: { width: number; height: number }): FontMetrics {
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")!
    ctx.font = `${this.fontSize}px ${this.fontFamily}`

    const metrics = ctx.measureText("M")

    // Use actualBoundingBox for accurate height, fallback to fontSize-based estimate
    const ascent = metrics.actualBoundingBoxAscent ?? this.fontSize * 0.8
    const descent = metrics.actualBoundingBoxDescent ?? this.fontSize * 0.2

    // Natural character height (like xterm.js scaledCharHeight)
    const charHeight = Math.ceil(ascent + descent)

    // Cell height from measurement utility
    const cellHeight = cellSize.height

    // Vertical centering offset
    const charTop = this.lineHeightMultiplier === 1 ? 0 : Math.round((cellHeight - charHeight) / 2)

    // For "alphabetic" baseline, position so text is vertically centered
    const baseline = Math.round(charTop + ascent)

    return {
      charWidth: cellSize.width,
      cellHeight,
      baseline,
    }
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

  private updateSize(): void {
    const width = this.cols * this.metrics.charWidth
    const height = this.rows * this.metrics.cellHeight

    // Update wrapper
    this.wrapper.style.width = `${width}px`
    this.wrapper.style.height = `${height}px`

    // Update canvas
    this.canvas.style.width = `${width}px`
    this.canvas.style.height = `${height}px`
    this.canvas.width = width * this.dpr
    this.canvas.height = height * this.dpr
    this.ctx.scale(this.dpr, this.dpr)

    this.clear()
  }

  /** Recalculate size from container and update. Call this after container resizes. */
  resize(): { cols: number; rows: number } {
    this.recalculateSize()
    this.updateSize()
    return { cols: this.cols, rows: this.rows }
  }

  private injectStyles(): void {
    // Check if styles already exist in this container's scope
    if (this.wrapper.querySelector("style")) return

    const style = document.createElement("style")
    style.textContent = `
      .opentui-text-layer::selection {
        background-color: rgba(100, 150, 255, 0.3);
      }
      .opentui-text-layer *::selection {
        background-color: rgba(100, 150, 255, 0.3);
      }
    `
    this.wrapper.appendChild(style)
  }

  private startCursorBlink(): void {
    this.stopCursorBlink()
    this.cursorBlinkInterval = setInterval(() => {
      this.cursorBlinkVisible = !this.cursorBlinkVisible
      this.cursorEl.style.opacity = this.focused && this.cursorBlinkVisible ? "1" : "0"
    }, 530) // ~1s full cycle (530ms on, 530ms off)
  }

  private stopCursorBlink(): void {
    if (this.cursorBlinkInterval) {
      clearInterval(this.cursorBlinkInterval)
      this.cursorBlinkInterval = null
    }
  }

  private resetCursorBlink(): void {
    this.cursorBlinkVisible = true
    this.cursorEl.style.opacity = this.focused ? "1" : "0"
    this.startCursorBlink()
  }

  private clear(): void {
    this.ctx.fillStyle = this.backgroundColor
    this.ctx.fillRect(0, 0, this.cols * this.metrics.charWidth, this.rows * this.metrics.cellHeight)
  }

  /**
   * Snap a coordinate to the physical pixel grid for crisp line rendering.
   * When ctx.scale(dpr, dpr) is active, we need to snap to physical pixel centers.
   */
  private snapToPixel(value: number): number {
    const physical = value * this.dpr
    const snappedPhysical = Math.round(physical + 0.5) - 0.5
    return snappedPhysical / this.dpr
  }

  renderFull(data: VTermData): void {
    this.cols = data.cols
    this.rows = data.rows

    this.updateSize()

    // Clear canvas
    this.clear()

    // Clear text layer
    this.textLayer.innerHTML = ""

    // Render each line
    for (let y = 0; y < data.lines.length; y++) {
      this.renderLine(data.lines[y], y)
    }

    // Update cursor
    this.updateCursor(data.cursor[0], data.cursor[1], data.cursorVisible)
  }

  applyDiff(changes: Array<{ index: number; line: VTermLine }>): void {
    for (const { index, line } of changes) {
      // Clear line area on canvas
      const y = index * this.metrics.cellHeight
      this.ctx.fillStyle = this.backgroundColor
      this.ctx.fillRect(0, y, this.cols * this.metrics.charWidth, this.metrics.cellHeight)

      // Re-render line
      this.renderLine(line, index)
    }
  }

  private renderLine(line: VTermLine, lineIndex: number): void {
    const y = lineIndex * this.metrics.cellHeight
    let x = 0
    let textContent = ""

    // First pass: collect text for selection layer
    for (const span of line.spans) {
      textContent += span.text
    }

    // Update text layer for this line
    this.updateTextLayerLine(lineIndex, textContent)

    // Second pass: render to canvas
    for (const span of line.spans) {
      x = this.renderSpan(span, x, y)
    }
  }

  private updateTextLayerLine(lineIndex: number, text: string): void {
    // Ensure we have enough line divs
    while (this.textLayer.children.length <= lineIndex) {
      const lineDiv = document.createElement("div")
      lineDiv.style.height = `${this.metrics.cellHeight}px`
      this.textLayer.appendChild(lineDiv)
    }

    const lineDiv = this.textLayer.children[lineIndex] as HTMLDivElement
    // Use a non-breaking space if line is empty to maintain height
    lineDiv.textContent = text || "\u00A0"
  }

  private renderSpan(span: VTermSpan, startX: number, y: number): number {
    let fg = span.fg || this.textColor
    let bg = span.bg

    // Handle inverse
    if (span.flags & StyleFlags.INVERSE) {
      ;[fg, bg] = [bg || this.backgroundColor, fg]
    }

    // Handle faint
    const alpha = span.flags & StyleFlags.FAINT ? 0.5 : 1

    // Build font string with proper weight control
    const weight = span.flags & StyleFlags.BOLD ? this.fontWeightBold : this.fontWeight
    const italic = span.flags & StyleFlags.ITALIC ? "italic " : ""
    const font = `${italic}${weight} ${this.fontSize}px ${this.fontFamily}`

    this.ctx.font = font
    this.ctx.textBaseline = this.textBaseline

    let x = startX

    // Render each character
    for (const char of span.text) {
      const cellX = x * this.metrics.charWidth
      const cellY = y

      // Always fill background for proper anti-aliasing (even if "transparent")
      // This ensures text edges blend correctly with the background
      const effectiveBg = bg && bg !== "#00000000" && bg !== "transparent" ? bg : this.backgroundColor
      this.ctx.fillStyle = effectiveBg
      this.ctx.fillRect(cellX, cellY, this.metrics.charWidth * (span.width || 1), this.metrics.cellHeight)

      // Check for custom glyph
      const customGlyph = customGlyphDefinitions[char]
      if (customGlyph) {
        this.renderCustomGlyph(customGlyph, cellX, cellY, fg, alpha)
      } else if (char !== " " && char !== "\u00A0") {
        // Draw regular character (baseline positioned for vertical centering)
        this.ctx.fillStyle = fg
        this.ctx.globalAlpha = alpha
        this.ctx.fillText(char, cellX, cellY + this.metrics.baseline)
        this.ctx.globalAlpha = 1
      }

      // Draw underline (just below baseline, with pixel snapping for crisp lines)
      if (span.flags & StyleFlags.UNDERLINE) {
        this.ctx.strokeStyle = fg
        this.ctx.lineWidth = 1
        this.ctx.beginPath()
        const underlineY = this.snapToPixel(cellY + this.metrics.baseline + 2)
        this.ctx.moveTo(cellX, underlineY)
        this.ctx.lineTo(cellX + this.metrics.charWidth, underlineY)
        this.ctx.stroke()
      }

      // Draw strikethrough (at vertical center of cell, with pixel snapping for crisp lines)
      if (span.flags & StyleFlags.STRIKETHROUGH) {
        this.ctx.strokeStyle = fg
        this.ctx.lineWidth = 1
        this.ctx.beginPath()
        const strikeY = this.snapToPixel(cellY + this.metrics.cellHeight / 2)
        this.ctx.moveTo(cellX, strikeY)
        this.ctx.lineTo(cellX + this.metrics.charWidth, strikeY)
        this.ctx.stroke()
      }

      x++
    }

    return x
  }

  private renderCustomGlyph(glyph: GlyphDefinition, x: number, y: number, color: string, alpha: number): void {
    this.ctx.globalAlpha = alpha

    if (glyph.type === "path") {
      drawPath(
        this.ctx,
        glyph.data,
        x,
        y,
        this.metrics.charWidth,
        this.metrics.cellHeight,
        glyph.strokeWidth,
        color,
        this.dpr,
      )
    } else if (glyph.type === "block") {
      drawBlocks(this.ctx, glyph.rects, x, y, this.metrics.charWidth, this.metrics.cellHeight, color)
    }

    this.ctx.globalAlpha = 1
  }

  updateCursor(x: number, y: number, visible: boolean): void {
    if (!visible) {
      this.stopCursorBlink()
      this.cursorEl.style.display = "none"
      return
    }

    // Reset blink to visible state if position changed
    if (x !== this.lastCursorX || y !== this.lastCursorY) {
      this.lastCursorX = x
      this.lastCursorY = y
      this.resetCursorBlink()
    } else if (!this.cursorBlinkInterval) {
      // Start blinking if not already
      this.startCursorBlink()
    }

    // Convert from 1-based terminal coordinates to 0-based
    const cssX = (x - 1) * this.metrics.charWidth
    const cssY = (y - 1) * this.metrics.cellHeight

    this.cursorEl.style.display = "block"
    this.cursorEl.style.left = `${cssX}px`
    this.cursorEl.style.top = `${cssY}px`
    this.cursorEl.style.width = `${this.metrics.charWidth}px`
    this.cursorEl.style.height = `${this.metrics.cellHeight}px`
  }

  getSize(): { cols: number; rows: number } {
    return { cols: this.cols, rows: this.rows }
  }

  setFocused(focused: boolean): void {
    this.focused = focused
    this.cursorEl.style.opacity = focused && this.cursorBlinkVisible ? "1" : "0"
  }

  setSelection(anchor: { x: number; y: number }, focus: { x: number; y: number }): void {
    // Normalize to start/end (anchor could be after focus if selecting backwards)
    const startY = Math.min(anchor.y, focus.y)
    const endY = Math.max(anchor.y, focus.y)
    const startX = anchor.y < focus.y ? anchor.x : anchor.y > focus.y ? focus.x : Math.min(anchor.x, focus.x)
    const endX = anchor.y < focus.y ? focus.x : anchor.y > focus.y ? anchor.x : Math.max(anchor.x, focus.x)

    const startLine = this.textLayer.children[startY] as HTMLDivElement
    const endLine = this.textLayer.children[endY] as HTMLDivElement
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
    this.stopCursorBlink()
    this.container.removeChild(this.wrapper)
  }
}
