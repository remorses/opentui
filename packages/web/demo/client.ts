import { connectTerminal } from "../src/client"

connectTerminal({
  url: `ws://${window.location.host}/ws`,
  container: "#terminal",
  maxCols: 120,
  maxRows: 40,
  useCanvas: true, // Use canvas renderer for pixel-perfect box-drawing
  fontFamily: "Consolas, monospace",
  fontSize: 14,
  lineHeight: 1.4,
  letterSpacing: 0,
  fontWeight: 500, // Heavier than normal (400) for better readability
  fontWeightBold: 700,

  // letterSpacing: 2, // Wider character cells
})
