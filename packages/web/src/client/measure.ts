/**
 * Cell measurement utilities for terminal layout calculations.
 * Use these to calculate terminal dimensions before creating a renderer.
 */

const DEFAULT_FONT_FAMILY = "ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace"
const DEFAULT_FONT_SIZE = 14
const DEFAULT_LINE_HEIGHT = 1.2

export interface MeasureCellOptions {
  fontSize?: number
  fontFamily?: string
  lineHeight?: number
  letterSpacing?: number
}

export interface CellSize {
  width: number
  height: number
}

/**
 * Measure cell dimensions for a given font configuration.
 * Use this to calculate terminal layout before creating a renderer.
 *
 * @example
 * ```ts
 * const cell = measureCellSize({ fontSize: 14 })
 * const cols = Math.floor(containerWidth / cell.width)
 * const rows = Math.floor(containerHeight / cell.height)
 * ```
 */
export function measureCellSize(options: MeasureCellOptions = {}): CellSize {
  const {
    fontSize = DEFAULT_FONT_SIZE,
    fontFamily = DEFAULT_FONT_FAMILY,
    lineHeight = DEFAULT_LINE_HEIGHT,
    letterSpacing = 0,
  } = options

  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")!
  ctx.font = `${fontSize}px ${fontFamily}`

  return {
    // Round to integers to prevent sub-pixel gaps between adjacent cells
    width: Math.ceil(ctx.measureText("M").width + letterSpacing),
    height: Math.ceil(fontSize * lineHeight),
  }
}

/**
 * Calculate how many cols/rows fit in a container at a given font size.
 *
 * @example
 * ```ts
 * const { cols, rows } = calculateGridSize({
 *   containerWidth: 800,
 *   containerHeight: 600,
 *   fontSize: 14,
 * })
 * ```
 */
export function calculateGridSize(options: {
  containerWidth: number
  containerHeight: number
  fontSize?: number
  fontFamily?: string
  lineHeight?: number
  letterSpacing?: number
  maxCols?: number
  maxRows?: number
}): { cols: number; rows: number; cellWidth: number; cellHeight: number } {
  const { containerWidth, containerHeight, maxCols = 500, maxRows = 500, ...measureOptions } = options

  const cell = measureCellSize(measureOptions)

  return {
    cols: Math.min(Math.floor(containerWidth / cell.width), maxCols),
    rows: Math.min(Math.floor(containerHeight / cell.height), maxRows),
    cellWidth: cell.width,
    cellHeight: cell.height,
  }
}

/**
 * Find the largest font size from a list that fits minimum cols/rows in a container.
 *
 * @example
 * ```ts
 * const result = findBestFontSize({
 *   containerWidth: 400,
 *   containerHeight: 300,
 *   minCols: 60,
 *   minRows: 15,
 *   fontSizes: [18, 16, 14, 12, 10],
 * })
 * // result: { fontSize: 12, cols: 65, rows: 18, cellWidth: 6.1, cellHeight: 14.4 }
 * ```
 */
export function findBestFontSize(options: {
  containerWidth: number
  containerHeight: number
  minCols: number
  minRows: number
  fontSizes?: number[]
  fontFamily?: string
  lineHeight?: number
  letterSpacing?: number
}): { fontSize: number; cols: number; rows: number; cellWidth: number; cellHeight: number } {
  const {
    containerWidth,
    containerHeight,
    minCols,
    minRows,
    fontSizes = [20, 18, 16, 14, 12, 10, 8],
    ...measureOptions
  } = options

  for (const fontSize of fontSizes) {
    const result = calculateGridSize({
      containerWidth,
      containerHeight,
      fontSize,
      ...measureOptions,
    })

    if (result.cols >= minCols && result.rows >= minRows) {
      return { fontSize, ...result }
    }
  }

  // Fallback to smallest font
  const smallest = fontSizes[fontSizes.length - 1] ?? 10
  const result = calculateGridSize({
    containerWidth,
    containerHeight,
    fontSize: smallest,
    ...measureOptions,
  })

  return { fontSize: smallest, ...result }
}
