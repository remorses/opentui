#!/usr/bin/env bun

import { opentuiWebSocket } from "@opentuah/web"
import { ExampleSelector } from "@opentui/core/examples"
import { networkInterfaces } from "os"
import homepage from "./index.html"

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

  routes: {
    "/": homepage,
    "/health": () => Response.json({ status: "ok", sessions: ws.sessionManager.getSessionCount() }),
  },

  fetch(req, server) {
    const wsResponse = ws.fetch(req, server)
    if (wsResponse !== null) {
      return wsResponse
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
