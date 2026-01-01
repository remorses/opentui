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

const DEFAULT_BG = "#1e1e1e"
const DEFAULT_FG = "#d4d4d4"
const DEFAULT_FONT_SIZE = 14
const DEFAULT_LINE_HEIGHT = 1.2
const DEFAULT_MAX_COLS = 200
const DEFAULT_MAX_ROWS = 200

/**
 * Check which font from the font-family string is actually being rendered.
 * Uses canvas width comparison - more reliable than document.fonts.check()
 * which can return true for fonts that aren't actually installed.
 */
function checkFontAvailability(
  fontFamily: string,
  fontSize: number
): { available: string | null; requested: string; usingFallback: boolean } {
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")!
  // Use characters with varying widths across different fonts
  const testString = "mmmmmmmmmmlli"

  // Parse font family string into individual fonts
  const fonts = fontFamily.split(",").map((f) => f.trim().replace(/^['"]|['"]$/g, ""))
  const requested = fonts[0]

  // Get baseline width with generic monospace
  ctx.font = `${fontSize}px monospace`
  const fallbackWidth = ctx.measureText(testString).width

  // Test each font individually (not with fallback chain)
  for (const font of fonts) {
    if (font === "monospace" || font === "sans-serif" || font === "serif") continue

    // Test font alone - if it's not available, browser uses default (not our fallback chain)
    ctx.font = `${fontSize}px "${font}"`
    const fontWidth = ctx.measureText(testString).width

    // Also test with explicit fallback to compare
    ctx.font = `${fontSize}px "NonExistentFont12345"`
    const missingFontWidth = ctx.measureText(testString).width

    // If this font's width differs from a missing font, it's actually installed
    if (Math.abs(fontWidth - missingFontWidth) > 0.1) {
      return { available: font, requested, usingFallback: font !== requested }
    }
  }

  return { available: null, requested, usingFallback: true }
}

/** Detect the most common background color from terminal content */
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

export interface CanvasRendererOptions {
  container: HTMLElement
  maxCols?: number
  maxRows?: number
  fontFamily?: string
  fontSize?: number
  /** Line height multiplier (default: 1.2) */
  lineHeight?: number
  backgroundColor?: string
  textColor?: string
  devicePixelRatio?: number
  onResize?: (size: { cols: number; rows: number }) => void
}

export interface FontMetrics {
  charWidth: number
  charHeight: number
  baseline: number
}

export class CanvasRenderer {
  private container: HTMLElement
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private textLayer: HTMLDivElement // Hidden layer for text selection
  private cursorEl: HTMLDivElement

  private maxCols: number
  private maxRows: number
  private fontSize: number
  private lineHeightMultiplier: number
  private fontFamily: string
  private backgroundColor: string
  private textColor: string
  private dpr: number

  private cols: number = 80
  private rows: number = 24
  private metrics: FontMetrics
  private detectedBackground: string | null = null
  private userProvidedBackground: boolean

  private onResize?: (size: { cols: number; rows: number }) => void
  private resizeTimeout: ReturnType<typeof setTimeout> | null = null
  private boundHandleResize: () => void

  constructor(options: CanvasRendererOptions) {
    this.container = options.container
    this.maxCols = options.maxCols ?? DEFAULT_MAX_COLS
    this.maxRows = options.maxRows ?? DEFAULT_MAX_ROWS
    this.fontSize = options.fontSize ?? DEFAULT_FONT_SIZE
    this.lineHeightMultiplier = options.lineHeight ?? DEFAULT_LINE_HEIGHT
    this.fontFamily = options.fontFamily ?? "ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono', monospace"
    this.backgroundColor = options.backgroundColor ?? DEFAULT_BG
    this.userProvidedBackground = options.backgroundColor !== undefined && 
      options.backgroundColor !== "transparent" && 
      options.backgroundColor !== "#00000000"
    this.textColor = options.textColor ?? DEFAULT_FG
    this.dpr = options.devicePixelRatio ?? window.devicePixelRatio ?? 1
    this.onResize = options.onResize

    // Check font availability after fonts are loaded (handles web fonts)
    document.fonts.ready.then(() => {
      const fontCheck = checkFontAvailability(this.fontFamily, this.fontSize)
      // Always log which font is being used for transparency
      console.info(`[CanvasRenderer] Using font: "${fontCheck.available || "system monospace"}"`)
      if (fontCheck.usingFallback) {
        if (fontCheck.available) {
          console.warn(
            `[CanvasRenderer] Requested font "${fontCheck.requested}" not available, using: "${fontCheck.available}"`
          )
        } else {
          console.error(
            `[CanvasRenderer] Requested font "${fontCheck.requested}" not available, using system monospace fallback`
          )
        }
      }
    })

    // Measure font metrics
    this.metrics = this.measureFont()

    // Calculate initial size
    this.recalculateSize()

    // Create wrapper div
    const wrapper = document.createElement("div")
    wrapper.className = "opentui-canvas-wrapper"
    wrapper.style.cssText = `
      position: relative;
      width: ${this.cols * this.metrics.charWidth}px;
      height: ${this.rows * this.metrics.charHeight}px;
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
      height: ${this.rows * this.metrics.charHeight}px;
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
      line-height: ${this.metrics.charHeight}px;
      color: transparent;
      white-space: pre;
      user-select: text;
      -webkit-user-select: text;
      cursor: text;
      z-index: 2;
    `

    // Set canvas size for high-DPI
    this.canvas.width = this.cols * this.metrics.charWidth * this.dpr
    this.canvas.height = this.rows * this.metrics.charHeight * this.dpr

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
      height: ${this.metrics.charHeight}px;
      background-color: rgba(255, 255, 255, 0.7);
      pointer-events: none;
      display: none;
      z-index: 3;
      animation: opentui-blink 1s step-end infinite;
    `

    // Assemble DOM
    wrapper.appendChild(this.textLayer)
    wrapper.appendChild(this.canvas)
    wrapper.appendChild(this.cursorEl)
    this.container.appendChild(wrapper)

    // Inject styles
    this.injectStyles()

    // Setup resize listener
    this.boundHandleResize = this.handleResize.bind(this)
    window.addEventListener("resize", this.boundHandleResize)

    // Initial clear
    this.clear()
  }

  private measureFont(): FontMetrics {
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")!
    ctx.font = `${this.fontSize}px ${this.fontFamily}`

    const metrics = ctx.measureText("M")
    const charWidth = Math.ceil(metrics.width)

    // Use actualBoundingBox for accurate height, fallback to fontSize-based estimate
    const ascent = metrics.actualBoundingBoxAscent ?? this.fontSize * 0.8
    const descent = metrics.actualBoundingBoxDescent ?? this.fontSize * 0.2
    const naturalHeight = ascent + descent

    // Apply line height multiplier to fontSize (like CSS line-height)
    const charHeight = Math.ceil(this.fontSize * this.lineHeightMultiplier)

    // Center the text vertically within the line height
    const verticalPadding = (charHeight - naturalHeight) / 2
    const baseline = Math.ceil(verticalPadding + ascent)

    return {
      charWidth,
      charHeight,
      baseline,
    }
  }

  private recalculateSize(): void {
    const pageCols = Math.floor(window.innerWidth / this.metrics.charWidth)
    const pageRows = Math.floor(window.innerHeight / this.metrics.charHeight)

    this.cols = Math.min(this.maxCols, pageCols)
    this.rows = Math.min(this.maxRows, pageRows)
  }

  private handleResize(): void {
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout)
    }
    this.resizeTimeout = setTimeout(() => {
      const oldCols = this.cols
      const oldRows = this.rows
      this.recalculateSize()

      if (oldCols !== this.cols || oldRows !== this.rows) {
        this.updateSize()
        this.onResize?.({ cols: this.cols, rows: this.rows })
      }
    }, 10)
  }

  private updateSize(): void {
    const width = this.cols * this.metrics.charWidth
    const height = this.rows * this.metrics.charHeight

    // Update wrapper
    const wrapper = this.canvas.parentElement
    if (wrapper) {
      wrapper.style.width = `${width}px`
      wrapper.style.height = `${height}px`
    }

    // Update canvas
    this.canvas.style.width = `${width}px`
    this.canvas.style.height = `${height}px`
    this.canvas.width = width * this.dpr
    this.canvas.height = height * this.dpr
    this.ctx.scale(this.dpr, this.dpr)

    this.clear()
  }

  private injectStyles(): void {
    if (document.getElementById("opentui-canvas-styles")) return

    const style = document.createElement("style")
    style.id = "opentui-canvas-styles"
    style.textContent = `
      .opentui-text-layer::selection {
        background-color: rgba(100, 150, 255, 0.3);
      }
      .opentui-text-layer *::selection {
        background-color: rgba(100, 150, 255, 0.3);
      }
      @keyframes opentui-blink {
        50% { opacity: 0; }
      }
    `
    document.head.appendChild(style)
  }

  private clear(): void {
    this.ctx.fillStyle = this.backgroundColor
    this.ctx.fillRect(0, 0, this.cols * this.metrics.charWidth, this.rows * this.metrics.charHeight)
  }

  renderFull(data: VTermData): void {
    this.cols = data.cols
    this.rows = data.rows

    // Determine background color (only once)
    if (!this.detectedBackground) {
      if (this.userProvidedBackground) {
        // Use user-provided background
        this.detectedBackground = this.backgroundColor
      } else {
        // Auto-detect from terminal content
        this.detectedBackground = getMostCommonBackground(data)
        this.backgroundColor = this.detectedBackground
      }

      // Apply to document body and wrapper for seamless background
      document.body.style.backgroundColor = this.detectedBackground
      const wrapper = this.canvas.parentElement
      if (wrapper) {
        wrapper.style.backgroundColor = this.detectedBackground
      }
    }

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
      const y = index * this.metrics.charHeight
      this.ctx.fillStyle = this.backgroundColor
      this.ctx.fillRect(0, y, this.cols * this.metrics.charWidth, this.metrics.charHeight)

      // Re-render line
      this.renderLine(line, index)
    }
  }

  private renderLine(line: VTermLine, lineIndex: number): void {
    const y = lineIndex * this.metrics.charHeight
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
      lineDiv.style.height = `${this.metrics.charHeight}px`
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

    // Build font string
    let fontStyle = ""
    if (span.flags & StyleFlags.BOLD) fontStyle += "bold "
    if (span.flags & StyleFlags.ITALIC) fontStyle += "italic "
    const font = `${fontStyle}${this.fontSize}px ${this.fontFamily}`

    this.ctx.font = font
    this.ctx.textBaseline = "alphabetic"

    let x = startX

    // Render each character
    for (const char of span.text) {
      const cellX = x * this.metrics.charWidth
      const cellY = y

      // Draw background if not default
      if (bg && bg !== "#00000000" && bg !== "transparent") {
        this.ctx.fillStyle = bg
        this.ctx.fillRect(cellX, cellY, this.metrics.charWidth * (span.width || 1), this.metrics.charHeight)
      }

      // Check for custom glyph
      const customGlyph = customGlyphDefinitions[char]
      if (customGlyph) {
        this.renderCustomGlyph(customGlyph, cellX, cellY, fg, alpha)
      } else if (char !== " " && char !== "\u00A0") {
        // Draw regular character
        this.ctx.fillStyle = fg
        this.ctx.globalAlpha = alpha
        this.ctx.fillText(char, cellX, cellY + this.metrics.baseline)
        this.ctx.globalAlpha = 1
      }

      // Draw underline
      if (span.flags & StyleFlags.UNDERLINE) {
        this.ctx.strokeStyle = fg
        this.ctx.lineWidth = 1
        this.ctx.beginPath()
        this.ctx.moveTo(cellX, cellY + this.metrics.baseline + 2)
        this.ctx.lineTo(cellX + this.metrics.charWidth, cellY + this.metrics.baseline + 2)
        this.ctx.stroke()
      }

      // Draw strikethrough
      if (span.flags & StyleFlags.STRIKETHROUGH) {
        this.ctx.strokeStyle = fg
        this.ctx.lineWidth = 1
        this.ctx.beginPath()
        const strikeY = cellY + this.metrics.charHeight / 2
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
      drawPath(this.ctx, glyph.data, x, y, this.metrics.charWidth, this.metrics.charHeight, glyph.strokeWidth, color)
    } else if (glyph.type === "block") {
      drawBlocks(this.ctx, glyph.rects, x, y, this.metrics.charWidth, this.metrics.charHeight, color)
    }

    this.ctx.globalAlpha = 1
  }

  updateCursor(x: number, y: number, visible: boolean): void {
    if (!visible) {
      this.cursorEl.style.display = "none"
      return
    }

    // Convert from 1-based terminal coordinates to 0-based
    const cssX = (x - 1) * this.metrics.charWidth
    const cssY = (y - 1) * this.metrics.charHeight

    this.cursorEl.style.display = "block"
    this.cursorEl.style.left = `${cssX}px`
    this.cursorEl.style.top = `${cssY}px`
    this.cursorEl.style.width = `${this.metrics.charWidth}px`
    this.cursorEl.style.height = `${this.metrics.charHeight}px`
  }

  getSize(): { cols: number; rows: number } {
    return { cols: this.cols, rows: this.rows }
  }

  destroy(): void {
    window.removeEventListener("resize", this.boundHandleResize)
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout)
    }
    const wrapper = this.canvas.parentElement
    if (wrapper) {
      this.container.removeChild(wrapper)
    }
  }
}
