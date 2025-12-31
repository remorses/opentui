import { Readable } from "stream"
import { CliRenderer, resolveRenderLib, type VTermData } from "@opentui/core"
import type { Modifiers } from "../shared/types"

export interface WebRendererOptions {
  cols: number
  rows: number
}

export interface WebRenderer {
  renderer: CliRenderer
  injectKey: (key: string, modifiers?: Modifiers) => void
  injectMouseClick: (x: number, y: number, button?: number) => void
  injectMouseMove: (x: number, y: number) => void
  injectMouseScroll: (x: number, y: number, direction: "up" | "down") => void
  resize: (cols: number, rows: number) => void
  render: () => Promise<void>
  captureSpans: () => VTermData
  destroy: () => void
}

// Key code mappings
const KEY_CODES: Record<string, string> = {
  Enter: "\r",
  Backspace: "\b",
  Tab: "\t",
  Escape: "\x1b",
  ArrowUp: "\x1b[A",
  ArrowDown: "\x1b[B",
  ArrowRight: "\x1b[C",
  ArrowLeft: "\x1b[D",
  Home: "\x1b[H",
  End: "\x1b[F",
  Delete: "\x1b[3~",
  PageUp: "\x1b[5~",
  PageDown: "\x1b[6~",
  F1: "\x1bOP",
  F2: "\x1bOQ",
  F3: "\x1bOR",
  F4: "\x1bOS",
  F5: "\x1b[15~",
  F6: "\x1b[17~",
  F7: "\x1b[18~",
  F8: "\x1b[19~",
  F9: "\x1b[20~",
  F10: "\x1b[21~",
  F11: "\x1b[23~",
  F12: "\x1b[24~",
}

const MOUSE_BUTTONS = {
  LEFT: 0,
  MIDDLE: 1,
  RIGHT: 2,
  WHEEL_UP: 64,
  WHEEL_DOWN: 65,
}

export async function createWebRenderer(options: WebRendererOptions): Promise<WebRenderer> {
  const { cols, rows } = options

  // Disable stdout interception for web renderers
  process.env.OTUI_OVERRIDE_STDOUT = "false"

  // Create a fake stdin stream for input injection
  const stdin = new Readable({ read() {} }) as NodeJS.ReadStream

  const ziglib = resolveRenderLib()
  const rendererPtr = ziglib.createRenderer(cols, rows, { testing: true })
  if (!rendererPtr) {
    throw new Error("Failed to create web renderer")
  }

  ziglib.setUseThread(rendererPtr, false)

  // Create a fake stdout to avoid TTY issues
  const fakeStdout = {
    columns: cols,
    rows: rows,
    write: () => true,
  } as unknown as NodeJS.WriteStream

  const renderer = new CliRenderer(ziglib, rendererPtr, stdin, fakeStdout, cols, rows, {
    useAlternateScreen: false,
    useConsole: false,
    useMouse: true,
  })

  // Remove SIGWINCH handler since we handle resize manually
  // @ts-ignore - accessing private handler
  process.off("SIGWINCH", renderer["sigwinchHandler"])

  const injectKey = (key: string, modifiers?: Modifiers) => {
    let keyCode = KEY_CODES[key] || key

    // Handle modifiers
    if (modifiers) {
      if (keyCode.startsWith("\x1b[") && keyCode.length > 2) {
        // Arrow keys and special keys with modifiers
        const modifier =
          1 + (modifiers.shift ? 1 : 0) + (modifiers.alt ? 2 : 0) + (modifiers.ctrl ? 4 : 0) + (modifiers.meta ? 8 : 0)
        if (modifier > 1) {
          const tildeMatch = keyCode.match(/^\x1b\[(\d+)~$/)
          if (tildeMatch) {
            keyCode = `\x1b[${tildeMatch[1]};${modifier}~`
          } else {
            const ending = keyCode.slice(-1)
            keyCode = `\x1b[1;${modifier}${ending}`
          }
        }
      } else if (keyCode.length === 1 && modifiers.ctrl) {
        // Ctrl + letter
        if (keyCode >= "a" && keyCode <= "z") {
          keyCode = String.fromCharCode(keyCode.charCodeAt(0) - 96)
        } else if (keyCode >= "A" && keyCode <= "Z") {
          keyCode = String.fromCharCode(keyCode.charCodeAt(0) - 64)
        }
        if (modifiers.alt) {
          keyCode = `\x1b${keyCode}`
        }
      } else if (modifiers.alt && keyCode.length === 1) {
        keyCode = `\x1b${keyCode}`
      }
    }

    stdin.emit("data", Buffer.from(keyCode))
  }

  const generateMouseEvent = (
    type: "down" | "up" | "move" | "scroll",
    x: number,
    y: number,
    button: number = 0,
  ): string => {
    let buttonCode = button

    if (type === "move") {
      buttonCode = 32 | 3 // motion flag + no button
    } else if (type === "scroll") {
      // button already has scroll flag
    }

    const ansiX = x + 1
    const ansiY = y + 1
    const pressRelease = type === "up" || type === "move" ? "m" : "M"

    return `\x1b[<${buttonCode};${ansiX};${ansiY}${pressRelease}`
  }

  const injectMouseClick = (x: number, y: number, button: number = 0) => {
    stdin.emit("data", Buffer.from(generateMouseEvent("down", x, y, button)))
    stdin.emit("data", Buffer.from(generateMouseEvent("up", x, y, button)))
  }

  const injectMouseMove = (x: number, y: number) => {
    stdin.emit("data", Buffer.from(generateMouseEvent("move", x, y)))
  }

  const injectMouseScroll = (x: number, y: number, direction: "up" | "down") => {
    const button = direction === "up" ? MOUSE_BUTTONS.WHEEL_UP : MOUSE_BUTTONS.WHEEL_DOWN
    stdin.emit("data", Buffer.from(generateMouseEvent("scroll", x, y, button)))
  }

  const resize = (newCols: number, newRows: number) => {
    // @ts-expect-error - accessing private method
    renderer.processResize(newCols, newRows)
  }

  const render = async () => {
    // @ts-expect-error - accessing private method
    await renderer.loop()
  }

  const captureSpans = (): VTermData => {
    const currentBuffer = renderer.currentRenderBuffer
    const lines = currentBuffer.getSpanLines()
    const cursorState = renderer.getCursorState()
    return {
      cols: currentBuffer.width,
      rows: currentBuffer.height,
      cursor: [cursorState.x, cursorState.y] as [number, number],
      offset: 0,
      totalLines: lines.length,
      lines,
    }
  }

  const destroy = () => {
    renderer.destroy()
  }

  return {
    renderer,
    injectKey,
    injectMouseClick,
    injectMouseMove,
    injectMouseScroll,
    resize,
    render,
    captureSpans,
    destroy,
  }
}
