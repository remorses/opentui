import { connectTerminal } from "../src/client"

connectTerminal({
  url: `ws://${window.location.host}/ws`,
  container: "#terminal",
})
