/**
 * Custom glyph definitions for box-drawing and block element characters.
 *
 * Adapted from xterm.js (MIT License)
 * Source: https://github.com/xtermjs/xterm.js/blob/master/addons/addon-webgl/src/customGlyphs/CustomGlyphDefinitions.ts
 *
 * Copyright (c) 2021 The xterm.js authors. All rights reserved.
 */

// Path shapes for box-drawing characters (normalized 0-1 coordinates)
const Shapes = {
  TOP_TO_BOTTOM: "M.5,0 L.5,1",
  LEFT_TO_RIGHT: "M0,.5 L1,.5",
  TOP_TO_RIGHT: "M.5,0 L.5,.5 L1,.5",
  TOP_TO_LEFT: "M.5,0 L.5,.5 L0,.5",
  LEFT_TO_BOTTOM: "M0,.5 L.5,.5 L.5,1",
  RIGHT_TO_BOTTOM: "M0.5,1 L.5,.5 L1,.5",
  MIDDLE_TO_TOP: "M.5,.5 L.5,0",
  MIDDLE_TO_LEFT: "M.5,.5 L0,.5",
  MIDDLE_TO_RIGHT: "M.5,.5 L1,.5",
  MIDDLE_TO_BOTTOM: "M.5,.5 L.5,1",
  T_TOP: "M0,.5 L1,.5 M.5,.5 L.5,0",
  T_LEFT: "M.5,0 L.5,1 M.5,.5 L0,.5",
  T_RIGHT: "M.5,0 L.5,1 M.5,.5 L1,.5",
  T_BOTTOM: "M0,.5 L1,.5 M.5,.5 L.5,1",
  CROSS: "M0,.5 L1,.5 M.5,0 L.5,1",
  TWO_DASHES_H: "M.1,.5 L.4,.5 M.6,.5 L.9,.5",
  THREE_DASHES_H: "M.0667,.5 L.2667,.5 M.4,.5 L.6,.5 M.7333,.5 L.9333,.5",
  FOUR_DASHES_H: "M.05,.5 L.2,.5 M.3,.5 L.45,.5 M.55,.5 L.7,.5 M.8,.5 L.95,.5",
  TWO_DASHES_V: "M.5,.1 L.5,.4 M.5,.6 L.5,.9",
  THREE_DASHES_V: "M.5,.0667 L.5,.2667 M.5,.4 L.5,.6 M.5,.7333 L.5,.9333",
  FOUR_DASHES_V: "M.5,.05 L.5,.2 M.5,.3 L.5,.45 M.5,.55 L.5,.7 M.5,.8 L.5,.95",
} as const

export type GlyphDefinition =
  | { type: "path"; data: string; strokeWidth: number }
  | { type: "block"; rects: Array<{ x: number; y: number; w: number; h: number }> }

// Box Drawing (U+2500-U+257F) and Block Elements (U+2580-U+259F)
export const customGlyphDefinitions: Record<string, GlyphDefinition> = {
  // Light and heavy solid lines
  "─": { type: "path", data: Shapes.LEFT_TO_RIGHT, strokeWidth: 1 },
  "━": { type: "path", data: Shapes.LEFT_TO_RIGHT, strokeWidth: 3 },
  "│": { type: "path", data: Shapes.TOP_TO_BOTTOM, strokeWidth: 1 },
  "┃": { type: "path", data: Shapes.TOP_TO_BOTTOM, strokeWidth: 3 },

  // Dashed lines
  "┄": { type: "path", data: Shapes.THREE_DASHES_H, strokeWidth: 1 },
  "┅": { type: "path", data: Shapes.THREE_DASHES_H, strokeWidth: 3 },
  "┆": { type: "path", data: Shapes.THREE_DASHES_V, strokeWidth: 1 },
  "┇": { type: "path", data: Shapes.THREE_DASHES_V, strokeWidth: 3 },
  "┈": { type: "path", data: Shapes.FOUR_DASHES_H, strokeWidth: 1 },
  "┉": { type: "path", data: Shapes.FOUR_DASHES_H, strokeWidth: 3 },
  "┊": { type: "path", data: Shapes.FOUR_DASHES_V, strokeWidth: 1 },
  "┋": { type: "path", data: Shapes.FOUR_DASHES_V, strokeWidth: 3 },
  "╌": { type: "path", data: Shapes.TWO_DASHES_H, strokeWidth: 1 },
  "╍": { type: "path", data: Shapes.TWO_DASHES_H, strokeWidth: 3 },
  "╎": { type: "path", data: Shapes.TWO_DASHES_V, strokeWidth: 1 },
  "╏": { type: "path", data: Shapes.TWO_DASHES_V, strokeWidth: 3 },

  // Corners
  "┌": { type: "path", data: Shapes.RIGHT_TO_BOTTOM, strokeWidth: 1 },
  "┏": { type: "path", data: Shapes.RIGHT_TO_BOTTOM, strokeWidth: 3 },
  "┐": { type: "path", data: Shapes.LEFT_TO_BOTTOM, strokeWidth: 1 },
  "┓": { type: "path", data: Shapes.LEFT_TO_BOTTOM, strokeWidth: 3 },
  "└": { type: "path", data: Shapes.TOP_TO_RIGHT, strokeWidth: 1 },
  "┗": { type: "path", data: Shapes.TOP_TO_RIGHT, strokeWidth: 3 },
  "┘": { type: "path", data: Shapes.TOP_TO_LEFT, strokeWidth: 1 },
  "┛": { type: "path", data: Shapes.TOP_TO_LEFT, strokeWidth: 3 },

  // T-junctions
  "├": { type: "path", data: Shapes.T_RIGHT, strokeWidth: 1 },
  "┣": { type: "path", data: Shapes.T_RIGHT, strokeWidth: 3 },
  "┤": { type: "path", data: Shapes.T_LEFT, strokeWidth: 1 },
  "┫": { type: "path", data: Shapes.T_LEFT, strokeWidth: 3 },
  "┬": { type: "path", data: Shapes.T_BOTTOM, strokeWidth: 1 },
  "┳": { type: "path", data: Shapes.T_BOTTOM, strokeWidth: 3 },
  "┴": { type: "path", data: Shapes.T_TOP, strokeWidth: 1 },
  "┻": { type: "path", data: Shapes.T_TOP, strokeWidth: 3 },

  // Cross
  "┼": { type: "path", data: Shapes.CROSS, strokeWidth: 1 },
  "╋": { type: "path", data: Shapes.CROSS, strokeWidth: 3 },

  // Half lines
  "╴": { type: "path", data: Shapes.MIDDLE_TO_LEFT, strokeWidth: 1 },
  "╵": { type: "path", data: Shapes.MIDDLE_TO_TOP, strokeWidth: 1 },
  "╶": { type: "path", data: Shapes.MIDDLE_TO_RIGHT, strokeWidth: 1 },
  "╷": { type: "path", data: Shapes.MIDDLE_TO_BOTTOM, strokeWidth: 1 },
  "╸": { type: "path", data: Shapes.MIDDLE_TO_LEFT, strokeWidth: 3 },
  "╹": { type: "path", data: Shapes.MIDDLE_TO_TOP, strokeWidth: 3 },
  "╺": { type: "path", data: Shapes.MIDDLE_TO_RIGHT, strokeWidth: 3 },
  "╻": { type: "path", data: Shapes.MIDDLE_TO_BOTTOM, strokeWidth: 3 },

  // Diagonals
  "╱": { type: "path", data: "M1,0 L0,1", strokeWidth: 1 },
  "╲": { type: "path", data: "M0,0 L1,1", strokeWidth: 1 },
  "╳": { type: "path", data: "M1,0 L0,1 M0,0 L1,1", strokeWidth: 1 },

  // Rounded corners
  "╭": { type: "path", data: "M.5,1 L.5,.5 Q.5,.5,1,.5", strokeWidth: 1 },
  "╮": { type: "path", data: "M.5,1 L.5,.5 Q.5,.5,0,.5", strokeWidth: 1 },
  "╯": { type: "path", data: "M.5,0 L.5,.5 Q.5,.5,0,.5", strokeWidth: 1 },
  "╰": { type: "path", data: "M.5,0 L.5,.5 Q.5,.5,1,.5", strokeWidth: 1 },

  // Double lines
  "═": { type: "path", data: "M0,.35 L1,.35 M0,.65 L1,.65", strokeWidth: 1 },
  "║": { type: "path", data: "M.35,0 L.35,1 M.65,0 L.65,1", strokeWidth: 1 },
  "╔": { type: "path", data: "M1,.35 L.35,.35 L.35,1 M1,.65 L.65,.65 L.65,1", strokeWidth: 1 },
  "╗": { type: "path", data: "M0,.35 L.65,.35 L.65,1 M0,.65 L.35,.65 L.35,1", strokeWidth: 1 },
  "╚": { type: "path", data: "M1,.35 L.65,.35 L.65,0 M1,.65 L.35,.65 L.35,0", strokeWidth: 1 },
  "╝": { type: "path", data: "M0,.35 L.35,.35 L.35,0 M0,.65 L.65,.65 L.65,0", strokeWidth: 1 },
  "╠": { type: "path", data: "M.35,0 L.35,1 M1,.35 L.65,.35 L.65,0 M1,.65 L.65,.65 L.65,1", strokeWidth: 1 },
  "╣": { type: "path", data: "M.65,0 L.65,1 M0,.35 L.35,.35 L.35,0 M0,.65 L.35,.65 L.35,1", strokeWidth: 1 },
  "╦": { type: "path", data: "M0,.35 L1,.35 M0,.65 L.35,.65 L.35,1 M1,.65 L.65,.65 L.65,1", strokeWidth: 1 },
  "╩": { type: "path", data: "M0,.65 L1,.65 M0,.35 L.35,.35 L.35,0 M1,.35 L.65,.35 L.65,0", strokeWidth: 1 },
  "╬": {
    type: "path",
    data: "M0,.35 L.35,.35 L.35,0 M.65,0 L.65,.35 L1,.35 M0,.65 L.35,.65 L.35,1 M.65,1 L.65,.65 L1,.65",
    strokeWidth: 1,
  },

  // Block elements (U+2580-U+259F)
  "▀": { type: "block", rects: [{ x: 0, y: 0, w: 1, h: 0.5 }] },
  "▁": { type: "block", rects: [{ x: 0, y: 0.875, w: 1, h: 0.125 }] },
  "▂": { type: "block", rects: [{ x: 0, y: 0.75, w: 1, h: 0.25 }] },
  "▃": { type: "block", rects: [{ x: 0, y: 0.625, w: 1, h: 0.375 }] },
  "▄": { type: "block", rects: [{ x: 0, y: 0.5, w: 1, h: 0.5 }] },
  "▅": { type: "block", rects: [{ x: 0, y: 0.375, w: 1, h: 0.625 }] },
  "▆": { type: "block", rects: [{ x: 0, y: 0.25, w: 1, h: 0.75 }] },
  "▇": { type: "block", rects: [{ x: 0, y: 0.125, w: 1, h: 0.875 }] },
  "█": { type: "block", rects: [{ x: 0, y: 0, w: 1, h: 1 }] },
  "▉": { type: "block", rects: [{ x: 0, y: 0, w: 0.875, h: 1 }] },
  "▊": { type: "block", rects: [{ x: 0, y: 0, w: 0.75, h: 1 }] },
  "▋": { type: "block", rects: [{ x: 0, y: 0, w: 0.625, h: 1 }] },
  "▌": { type: "block", rects: [{ x: 0, y: 0, w: 0.5, h: 1 }] },
  "▍": { type: "block", rects: [{ x: 0, y: 0, w: 0.375, h: 1 }] },
  "▎": { type: "block", rects: [{ x: 0, y: 0, w: 0.25, h: 1 }] },
  "▏": { type: "block", rects: [{ x: 0, y: 0, w: 0.125, h: 1 }] },
  "▐": { type: "block", rects: [{ x: 0.5, y: 0, w: 0.5, h: 1 }] },
  "▔": { type: "block", rects: [{ x: 0, y: 0, w: 1, h: 0.125 }] },
  "▕": { type: "block", rects: [{ x: 0.875, y: 0, w: 0.125, h: 1 }] },
  "▖": { type: "block", rects: [{ x: 0, y: 0.5, w: 0.5, h: 0.5 }] },
  "▗": { type: "block", rects: [{ x: 0.5, y: 0.5, w: 0.5, h: 0.5 }] },
  "▘": { type: "block", rects: [{ x: 0, y: 0, w: 0.5, h: 0.5 }] },
  "▙": {
    type: "block",
    rects: [
      { x: 0, y: 0, w: 0.5, h: 1 },
      { x: 0, y: 0.5, w: 1, h: 0.5 },
    ],
  },
  "▚": {
    type: "block",
    rects: [
      { x: 0, y: 0, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    ],
  },
  "▛": {
    type: "block",
    rects: [
      { x: 0, y: 0, w: 0.5, h: 1 },
      { x: 0.5, y: 0, w: 0.5, h: 0.5 },
    ],
  },
  "▜": {
    type: "block",
    rects: [
      { x: 0, y: 0, w: 1, h: 0.5 },
      { x: 0.5, y: 0, w: 0.5, h: 1 },
    ],
  },
  "▝": { type: "block", rects: [{ x: 0.5, y: 0, w: 0.5, h: 0.5 }] },
  "▞": {
    type: "block",
    rects: [
      { x: 0.5, y: 0, w: 0.5, h: 0.5 },
      { x: 0, y: 0.5, w: 0.5, h: 0.5 },
    ],
  },
  "▟": {
    type: "block",
    rects: [
      { x: 0.5, y: 0, w: 0.5, h: 1 },
      { x: 0, y: 0.5, w: 1, h: 0.5 },
    ],
  },
}

/**
 * Check if a character has a custom glyph definition
 */
export function hasCustomGlyph(char: string): boolean {
  return char in customGlyphDefinitions
}

/**
 * Get the custom glyph definition for a character
 */
export function getCustomGlyph(char: string): GlyphDefinition | undefined {
  return customGlyphDefinitions[char]
}

/**
 * Parse an SVG path string and draw it to a canvas context
 * Path is in normalized coordinates (0-1), scaled to cellWidth x cellHeight
 */
export function drawPath(
  ctx: CanvasRenderingContext2D,
  pathData: string,
  x: number,
  y: number,
  cellWidth: number,
  cellHeight: number,
  strokeWidth: number,
  color: string
): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = strokeWidth
  ctx.lineCap = "square"
  ctx.lineJoin = "miter"

  ctx.beginPath()

  // Parse SVG path commands
  const commands = pathData.match(/[MLQCZ][^MLQCZ]*/gi) || []

  for (const cmd of commands) {
    const type = cmd[0].toUpperCase()
    const args = cmd
      .slice(1)
      .trim()
      .split(/[\s,]+/)
      .map(Number)

    switch (type) {
      case "M": // Move to
        ctx.moveTo(x + args[0] * cellWidth, y + args[1] * cellHeight)
        break
      case "L": // Line to
        ctx.lineTo(x + args[0] * cellWidth, y + args[1] * cellHeight)
        break
      case "Q": // Quadratic curve
        ctx.quadraticCurveTo(
          x + args[0] * cellWidth,
          y + args[1] * cellHeight,
          x + args[2] * cellWidth,
          y + args[3] * cellHeight
        )
        break
      case "C": // Cubic curve
        ctx.bezierCurveTo(
          x + args[0] * cellWidth,
          y + args[1] * cellHeight,
          x + args[2] * cellWidth,
          y + args[3] * cellHeight,
          x + args[4] * cellWidth,
          y + args[5] * cellHeight
        )
        break
      case "Z": // Close path
        ctx.closePath()
        break
    }
  }

  ctx.stroke()
  ctx.restore()
}

/**
 * Draw block rectangles to a canvas context
 * Rectangles are in normalized coordinates (0-1), scaled to cellWidth x cellHeight
 */
export function drawBlocks(
  ctx: CanvasRenderingContext2D,
  rects: Array<{ x: number; y: number; w: number; h: number }>,
  x: number,
  y: number,
  cellWidth: number,
  cellHeight: number,
  color: string
): void {
  ctx.save()
  ctx.fillStyle = color

  for (const rect of rects) {
    ctx.fillRect(x + rect.x * cellWidth, y + rect.y * cellHeight, rect.w * cellWidth, rect.h * cellHeight)
  }

  ctx.restore()
}
