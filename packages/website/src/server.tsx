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

// Fly.io region from env
const FLY_REGION = process.env.FLY_REGION || "local"

// Start server
const port = Number(process.env.PORT) || 3001
const server = Bun.serve({
  port,
  hostname: "0.0.0.0",

  routes: {
    "/": homepage,
    "/health": () =>
      Response.json(
        { status: "ok", region: FLY_REGION, sessions: ws.sessionManager.getSessionCount() },
        { headers: { "X-Fly-Region": FLY_REGION } },
      ),
  },

  fetch(req, server) {
    const wsResponse = ws.fetch(req, server)
    if (wsResponse !== null) {
      return wsResponse
    }

    return new Response("Not found", { status: 404, headers: { "X-Fly-Region": FLY_REGION } })
  },

  websocket: {
    ...ws.websocket,
    idleTimeout: 120, // 2 minutes, send ping before this
  },
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
