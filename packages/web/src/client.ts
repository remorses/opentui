// Client exports (for browser)
export { connectTerminal, type ConnectOptions, type TerminalConnection } from "./client/connect"
export { CanvasRenderer, type CanvasRendererOptions } from "./client/canvas-renderer"

// Measurement utilities for layout calculations
export {
  measureCellSize,
  calculateGridSize,
  findBestFontSize,
  type MeasureCellOptions,
  type CellSize,
} from "./client/measure"

// Custom glyph utilities (for advanced usage)
export { customGlyphDefinitions, hasCustomGlyph, getCustomGlyph, drawPath, drawBlocks } from "./client/custom-glyphs"
export type { GlyphDefinition } from "./client/custom-glyphs"

// Shared types
export type { VTermData, VTermLine, VTermSpan, ClientMessage, ServerMessage, LineDiff, Modifiers } from "./shared/types"
