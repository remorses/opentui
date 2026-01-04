/**
 * Server for the grid demo - serves the grid.html and bundles grid-client.ts
 *
 * Usage: bun demo/grid-server.ts
 */

import html from "./grid.html"

const server = Bun.serve({
  port: 3002,
  hostname: "0.0.0.0",

  // @ts-expect-error - Bun's static option is not in the type definitions yet
  static: {
    "/": html,
    "/grid.html": html,
  },

  async fetch(req) {
    const url = new URL(req.url)

    if (url.pathname === "/grid-client.ts") {
      // Bundle the client TypeScript
      const result = await Bun.build({
        entrypoints: ["./demo/grid-client.ts"],
        target: "browser",
        minify: false,
      })

      if (result.outputs[0]) {
        const code = await result.outputs[0].text()
        return new Response(code, {
          headers: { "Content-Type": "application/javascript" },
        })
      }
    }

    return new Response("Not found", { status: 404 })
  },
})

console.log(`Grid demo server running at http://localhost:${server.port}`)
console.log(`Open http://localhost:${server.port}?namespace=grid-test in your browser`)
console.log(`\nTo spawn terminals: bun demo/spawn.tsx --namespace grid-test --id term-1`)
