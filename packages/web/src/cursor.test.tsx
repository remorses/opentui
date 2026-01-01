import { describe, test, expect, afterEach } from "bun:test"
import { testRender } from "@opentui/react/test-utils"

const CURSOR = "█" // Block cursor character

/**
 * Capture frame as grid with cursor marker inserted at cursor position
 */
function captureWithCursor(setup: Awaited<ReturnType<typeof testRender>>): string {
  const cursor = setup.renderer.getCursorState()
  const frame = setup.captureCharFrame()
  const lines = frame.split("\n")

  if (cursor.visible && cursor.y < lines.length) {
    const line = lines[cursor.y]
    // Convert to array to handle unicode properly
    const chars = [...line]
    if (cursor.x <= chars.length) {
      // Replace char at cursor position with cursor marker
      chars[cursor.x] = CURSOR
      lines[cursor.y] = chars.join("")
    }
  }

  return lines.join("\n")
}

describe("Cursor Position Tests", () => {
  let setup: Awaited<ReturnType<typeof testRender>>

  afterEach(() => {
    setup?.renderer.destroy()
  })

  test("empty focused input - cursor at start", async () => {
    setup = await testRender(<input focused />, { width: 15, height: 3 })
    await setup.renderOnce()

    expect(captureWithCursor(setup)).toMatchInlineSnapshot(`
"               
 █             
               
"
`)
  })

  test("after typing 'hello' - cursor at end", async () => {
    setup = await testRender(<input focused />, { width: 15, height: 3 })
    await setup.renderOnce()
    setup.mockInput.typeText("hello")
    await setup.renderOnce()

    expect(captureWithCursor(setup)).toMatchInlineSnapshot(`
"hello          
      █        
               
"
`)
  })

  test("with initial value - cursor at end", async () => {
    setup = await testRender(<input focused value="test" />, { width: 15, height: 3 })
    await setup.renderOnce()

    expect(captureWithCursor(setup)).toMatchInlineSnapshot(`
"test           
     █         
               
"
`)
  })

  test("arrow left moves cursor back", async () => {
    setup = await testRender(<input focused value="hello" />, { width: 15, height: 3 })
    await setup.renderOnce()
    setup.mockInput.pressKey("ARROW_LEFT")
    setup.mockInput.pressKey("ARROW_LEFT")
    await setup.renderOnce()

    expect(captureWithCursor(setup)).toMatchInlineSnapshot(`
"hello          
    █          
               
"
`)
  })

  test("Home key moves cursor to start", async () => {
    setup = await testRender(<input focused value="hello" />, { width: 15, height: 3 })
    await setup.renderOnce()
    setup.mockInput.pressKey("HOME")
    await setup.renderOnce()

    expect(captureWithCursor(setup)).toMatchInlineSnapshot(`
"hello          
 █             
               
"
`)
  })

  test("End key moves cursor to end", async () => {
    setup = await testRender(<input focused value="hello" />, { width: 15, height: 3 })
    await setup.renderOnce()
    setup.mockInput.pressKey("HOME")
    await setup.renderOnce()
    setup.mockInput.pressKey("END")
    await setup.renderOnce()

    expect(captureWithCursor(setup)).toMatchInlineSnapshot(`
"hello          
      █        
               
"
`)
  })

  test("backspace deletes and moves cursor", async () => {
    setup = await testRender(<input focused value="hello" />, { width: 15, height: 3 })
    await setup.renderOnce()
    setup.mockInput.pressKey("BACKSPACE")
    await setup.renderOnce()

    expect(captureWithCursor(setup)).toMatchInlineSnapshot(`
"hell           
     █         
               
"
`)
  })

  test("type in middle after arrow left", async () => {
    setup = await testRender(<input focused value="hllo" />, { width: 15, height: 3 })
    await setup.renderOnce()
    setup.mockInput.pressKey("HOME")
    setup.mockInput.pressKey("ARROW_RIGHT")
    await setup.renderOnce()

    // Cursor should be after 'h'
    expect(captureWithCursor(setup)).toMatchInlineSnapshot(`
"hllo           
  █            
               
"
`)

    // Type 'e' to make "hello"
    setup.mockInput.typeText("e")
    await setup.renderOnce()

    expect(captureWithCursor(setup)).toMatchInlineSnapshot(`
"hello          
   █           
               
"
`)
  })

  test("unfocused input - no cursor change", async () => {
    setup = await testRender(<input value="hello" />, { width: 15, height: 3 })
    const before = setup.renderer.getCursorState()
    await setup.renderOnce()
    const after = setup.renderer.getCursorState()

    // Cursor position unchanged
    expect(after.x).toBe(before.x)
    expect(after.y).toBe(before.y)
  })

  test("captureSpans includes cursor data", async () => {
    setup = await testRender(<input focused value="AB" />, { width: 15, height: 3 })
    await setup.renderOnce()

    const data = setup.captureSpans()
    expect(data.cursorVisible).toBe(true)
    expect(data.cursor).toEqual([3, 1]) // After "AB" with offset
  })

  test("cursor position in captureSpans updates on movement", async () => {
    setup = await testRender(<input focused value="test" />, { width: 15, height: 3 })
    await setup.renderOnce()

    const data1 = setup.captureSpans()
    setup.mockInput.pressKey("ARROW_LEFT")
    await setup.renderOnce()
    const data2 = setup.captureSpans()

    expect(data2.cursor[0]).toBe(data1.cursor[0] - 1)
  })
})
