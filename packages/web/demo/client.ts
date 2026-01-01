import { connectTerminal } from "../src/client"

connectTerminal({
  url: `ws://${window.location.host}/ws`,
  container: "#terminal",
  maxCols: 120,
  maxRows: 40,
  useCanvas: true, // Use canvas renderer for pixel-perfect box-drawing
  fontFamily: "Consolas, Menlo, Monaco, 'Courier New', monospace",
  fontSize: 14,
  lineHeight: 1.6, // Taller lines for better readability
})
