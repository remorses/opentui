#!/usr/bin/env bun

import { opentuiWebSocket } from "@opentuah/web"
import { ExampleSelector } from "@opentui/core/examples"
import { networkInterfaces } from "os"

// HTML for client
const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>OpenTUI Examples</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet" />
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      html,
      body {
        height: 100%;
        background: #0D1117;
        overflow: hidden;
        touch-action: none;
      }
    </style>
  </head>
  <body>
    <script type="module" src="/client.js"></script>
  </body>
</html>`

// Create WebSocket handler
const ws = opentuiWebSocket({
  maxCols: 120,
  maxRows: 40,
  frameRate: 60,
  onConnection: (session) => {
    console.log(`New session: ${session.id}`)

    session.renderer.setBackgroundColor("transparent")
    new ExampleSelector(session.renderer)

    return () => {
      console.log(`Session closed: ${session.id}`)
    }
  },
})

// Start server
const port = Number(process.env.PORT) || 3001
const server = Bun.serve({
  port,
  hostname: "0.0.0.0",

  async fetch(req, server) {
    const url = new URL(req.url)

    const wsResponse = ws.fetch(req, server)
    if (wsResponse !== null) {
      return wsResponse
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(html, {
        headers: { "Content-Type": "text/html" },
      })
    }

    if (url.pathname === "/client.js") {
      const clientBundle = await Bun.build({
        entrypoints: [import.meta.dir + "/client.ts"],
        minify: true,
      })
      const output = clientBundle.outputs[0]
      return new Response(output, {
        headers: { "Content-Type": "application/javascript" },
      })
    }

    if (url.pathname === "/health") {
      return Response.json({ status: "ok", sessions: ws.sessionManager.getSessionCount() })
    }

    return new Response("Not found", { status: 404 })
  },

  websocket: ws.websocket,
})

// Get local IP
const nets = networkInterfaces()
let localIP = "localhost"
for (const name of Object.keys(nets)) {
  for (const net of nets[name] || []) {
    if (net.family === "IPv4" && !net.internal) {
      localIP = net.address
      break
    }
  }
}

console.log(`OpenTUI Website running at:`)
console.log(`  Local:   http://localhost:${server.port}`)
console.log(`  Network: http://${localIP}:${server.port}`)
