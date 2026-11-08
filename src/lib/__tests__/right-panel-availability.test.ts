import { describe, expect, it } from "vitest"
import { isRightPanelAvailable } from "../right-panel-availability"

describe("isRightPanelAvailable", () => {
  it("keeps History and Repository available independently of AI Chat", () => {
    const availability = {
      aiChat: false,
      history: true,
      repository: true,
    }

    expect(isRightPanelAvailable("history", availability)).toBe(true)
    expect(isRightPanelAvailable("repository", availability)).toBe(true)
    expect(isRightPanelAvailable("chat", availability)).toBe(false)
  })

  it("closes modes that are not available in the current context", () => {
    const availability = {
      aiChat: true,
      history: false,
      repository: false,
    }

    expect(isRightPanelAvailable("history", availability)).toBe(false)
    expect(isRightPanelAvailable("repository", availability)).toBe(false)
    expect(isRightPanelAvailable("chat", availability)).toBe(true)
    expect(isRightPanelAvailable("closed", availability)).toBe(false)
  })
})
