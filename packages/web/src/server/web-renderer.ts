import { createTestRenderer } from "@opentui/core/testing"
import type { VTermData } from "../shared/types"
import type { Modifiers } from "../shared/types"

export interface WebRendererOptions {
  cols: number
  rows: number
}

export interface WebRenderer {
  renderer: Awaited<ReturnType<typeof createTestRenderer>>["renderer"]
  injectKey: (key: string, modifiers?: Modifiers) => void
  injectMouseClick: (x: number, y: number, button?: number) => void
  injectMouseMove: (x: number, y: number) => void
  injectMouseScroll: (x: number, y: number, direction: "up" | "down") => void
  resize: (cols: number, rows: number) => void
  render: () => Promise<void>
  captureSpans: () => VTermData
  destroy: () => void
}

export async function createWebRenderer(options: WebRendererOptions): Promise<WebRenderer> {
  const { cols, rows } = options

  const { renderer, mockInput, mockMouse, renderOnce, captureSpans, resize } = await createTestRenderer({
    width: cols,
    height: rows,
  })

  return {
    renderer,
    injectKey: (key: string, modifiers?: Modifiers) => {
      mockInput.send(key, modifiers)
    },
    injectMouseClick: (x: number, y: number, button: number = 0) => {
      mockMouse.click(x, y, button === 0 ? "left" : button === 2 ? "right" : "middle")
    },
    injectMouseMove: (x: number, y: number) => {
      mockMouse.move(x, y)
    },
    injectMouseScroll: (x: number, y: number, direction: "up" | "down") => {
      mockMouse.scroll(x, y, direction)
    },
    resize,
    render: renderOnce,
    captureSpans,
    destroy: () => {
      renderer.destroy()
    },
  }
}
