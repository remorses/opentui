import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { createTestRenderer, type TestRenderer } from "./test-renderer"
import { TextRenderable } from "../renderables/Text"
import { BoxRenderable } from "../renderables/Box"
import { VTermStyleFlags, TextAttributes } from "../types"
import { RGBA } from "../lib"

describe("captureSpans", () => {
  let renderer: TestRenderer
  let renderOnce: () => Promise<void>
  let captureSpans: ReturnType<typeof createTestRenderer> extends Promise<infer T>
    ? T extends { captureSpans: infer S }
      ? S
      : never
    : never

  beforeEach(async () => {
    const setup = await createTestRenderer({ width: 40, height: 10 })
    renderer = setup.renderer
    renderOnce = setup.renderOnce
    captureSpans = setup.captureSpans
  })

  afterEach(() => {
    renderer.destroy()
  })

  test("should return correct dimensions", async () => {
    await renderOnce()
    const data = captureSpans()

    expect(data.cols).toBe(40)
    expect(data.rows).toBe(10)
  })

  test("should return correct number of lines", async () => {
    await renderOnce()
    const data = captureSpans()

    expect(data.lines.length).toBe(10)
    expect(data.totalLines).toBe(10)
  })

  test("should capture text content in spans", async () => {
    const text = new TextRenderable(renderer, { content: "Hello World" })
    renderer.root.add(text)
    await renderOnce()

    const data = captureSpans()
    const firstLine = data.lines[0]

    const textContent = firstLine.spans.map((s) => s.text).join("")
    expect(textContent).toContain("Hello World")
  })

  test("should group consecutive cells with same styling into single span", async () => {
    const text = new TextRenderable(renderer, { content: "AAAA" })
    renderer.root.add(text)
    await renderOnce()

    const data = captureSpans()
    const firstLine = data.lines[0]

    // The "AAAA" should be in one span (or grouped with surrounding spaces if same style)
    const aaaSpan = firstLine.spans.find((s) => s.text.includes("AAAA"))
    expect(aaaSpan).toBeDefined()
  })

  test("should capture foreground color", async () => {
    const text = new TextRenderable(renderer, {
      content: "Red Text",
      fg: RGBA.fromHex("#ff0000"),
    })
    renderer.root.add(text)
    await renderOnce()

    const data = captureSpans()
    const firstLine = data.lines[0]
    const redSpan = firstLine.spans.find((s) => s.text.includes("Red"))

    expect(redSpan).toBeDefined()
    expect(redSpan!.fg).toBe("#ff0000")
  })

  test("should capture background color", async () => {
    const box = new BoxRenderable(renderer, {
      width: 10,
      height: 3,
      backgroundColor: RGBA.fromHex("#00ff00"),
    })
    renderer.root.add(box)
    await renderOnce()

    const data = captureSpans()
    const secondLine = data.lines[1]
    const greenSpan = secondLine.spans.find((s) => s.bg === "#00ff00")

    expect(greenSpan).toBeDefined()
  })

  test("should return null for transparent colors", async () => {
    await renderOnce()

    const data = captureSpans()
    // Empty cells typically have transparent background
    const firstLine = data.lines[0]
    const transparentSpan = firstLine.spans.find((s) => s.bg === null)

    expect(transparentSpan).toBeDefined()
  })

  test("should capture bold attribute", async () => {
    const text = new TextRenderable(renderer, {
      content: "Bold",
      attributes: TextAttributes.BOLD,
    })
    renderer.root.add(text)
    await renderOnce()

    const data = captureSpans()
    const firstLine = data.lines[0]
    const boldSpan = firstLine.spans.find((s) => s.text.includes("Bold"))

    expect(boldSpan).toBeDefined()
    expect(boldSpan!.flags & VTermStyleFlags.BOLD).toBeTruthy()
  })

  test("should capture italic attribute", async () => {
    const text = new TextRenderable(renderer, {
      content: "Italic",
      attributes: TextAttributes.ITALIC,
    })
    renderer.root.add(text)
    await renderOnce()

    const data = captureSpans()
    const firstLine = data.lines[0]
    const italicSpan = firstLine.spans.find((s) => s.text.includes("Italic"))

    expect(italicSpan).toBeDefined()
    expect(italicSpan!.flags & VTermStyleFlags.ITALIC).toBeTruthy()
  })

  test("should capture underline attribute", async () => {
    const text = new TextRenderable(renderer, {
      content: "Underline",
      attributes: TextAttributes.UNDERLINE,
    })
    renderer.root.add(text)
    await renderOnce()

    const data = captureSpans()
    const firstLine = data.lines[0]
    const underlineSpan = firstLine.spans.find((s) => s.text.includes("Underline"))

    expect(underlineSpan).toBeDefined()
    expect(underlineSpan!.flags & VTermStyleFlags.UNDERLINE).toBeTruthy()
  })

  test("should capture dim/faint attribute", async () => {
    const text = new TextRenderable(renderer, {
      content: "Dim",
      attributes: TextAttributes.DIM,
    })
    renderer.root.add(text)
    await renderOnce()

    const data = captureSpans()
    const firstLine = data.lines[0]
    const dimSpan = firstLine.spans.find((s) => s.text.includes("Dim"))

    expect(dimSpan).toBeDefined()
    expect(dimSpan!.flags & VTermStyleFlags.FAINT).toBeTruthy()
  })

  test("should capture multiple style attributes", async () => {
    const text = new TextRenderable(renderer, {
      content: "Styled",
      attributes: TextAttributes.BOLD | TextAttributes.ITALIC | TextAttributes.UNDERLINE,
    })
    renderer.root.add(text)
    await renderOnce()

    const data = captureSpans()
    const firstLine = data.lines[0]
    const styledSpan = firstLine.spans.find((s) => s.text.includes("Styled"))

    expect(styledSpan).toBeDefined()
    expect(styledSpan!.flags & VTermStyleFlags.BOLD).toBeTruthy()
    expect(styledSpan!.flags & VTermStyleFlags.ITALIC).toBeTruthy()
    expect(styledSpan!.flags & VTermStyleFlags.UNDERLINE).toBeTruthy()
  })

  test("should include cursor position", async () => {
    await renderOnce()
    const data = captureSpans()

    expect(data.cursor).toBeDefined()
    expect(Array.isArray(data.cursor)).toBe(true)
    expect(data.cursor.length).toBe(2)
  })

  test("should have offset and totalLines", async () => {
    await renderOnce()
    const data = captureSpans()

    expect(data.offset).toBe(0)
    expect(data.totalLines).toBe(10)
  })

  test("should calculate span width correctly", async () => {
    const text = new TextRenderable(renderer, { content: "ABCD" })
    renderer.root.add(text)
    await renderOnce()

    const data = captureSpans()
    const firstLine = data.lines[0]
    const abcdSpan = firstLine.spans.find((s) => s.text.includes("ABCD"))

    expect(abcdSpan).toBeDefined()
    expect(abcdSpan!.width).toBeGreaterThanOrEqual(4)
  })

  test("should split spans when styling changes", async () => {
    const text1 = new TextRenderable(renderer, {
      content: "AAA",
      fg: RGBA.fromHex("#ff0000"),
    })
    const text2 = new TextRenderable(renderer, {
      content: "BBB",
      fg: RGBA.fromHex("#00ff00"),
    })
    renderer.root.add(text1)
    renderer.root.add(text2)
    await renderOnce()

    const data = captureSpans()

    // Find spans with different colors
    let hasRedSpan = false
    let hasGreenSpan = false

    for (const line of data.lines) {
      for (const span of line.spans) {
        if (span.fg === "#ff0000") hasRedSpan = true
        if (span.fg === "#00ff00") hasGreenSpan = true
      }
    }

    expect(hasRedSpan).toBe(true)
    expect(hasGreenSpan).toBe(true)
  })
})
