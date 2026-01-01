/**
 * Cloudflare Worker that serves the OpenTUI web client.
 * 
 * Routes:
 * - GET /s/{tunnelId} - Serves HTML client that connects to the tunnel
 * - GET /health - Health check endpoint
 * - GET / - Redirects to GitHub
 * 
 * The tunnel WebSocket itself is hosted separately at /_tunnel/*
 */

import type { ExecutionContext } from "@cloudflare/workers-types"

export interface Env {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    // Health check
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { "Content-Type": "application/json" },
      })
    }

    // Serve client HTML at /s/{tunnelId}
    if (url.pathname.startsWith("/s/")) {
      const tunnelId = url.pathname.slice(3)
      
      if (!tunnelId || tunnelId.includes("/")) {
        return new Response("Invalid tunnel ID", { status: 400 })
      }

      // Fetch the static HTML from assets
      const assetUrl = new URL("/index.html", request.url)
      const response = await env.ASSETS.fetch(assetUrl)
      
      // Return the HTML with correct content type
      return new Response(response.body, {
        status: response.status,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      })
    }

    // Root redirect to GitHub
    if (url.pathname === "/" || url.pathname === "") {
      return Response.redirect("https://github.com/sst/opentui", 302)
    }

    return new Response("Not found", { status: 404 })
  },
}
