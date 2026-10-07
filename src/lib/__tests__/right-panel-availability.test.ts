import { describe, expect, it } from "vitest"
import { isRightPanelAvailable } from "../right-panel-availability"

describe("isRightPanelAvailable", () => {
  it("keeps Properties and DBML available when AI Chat is not entitled", () => {
    const availability = {
      aiChat: false,
      dbml: true,
      diagramProperties: true,
      history: true,
      repository: true,
    }

    expect(isRightPanelAvailable("properties", availability)).toBe(true)
    expect(isRightPanelAvailable("dbml", availability)).toBe(true)
    expect(isRightPanelAvailable("chat", availability)).toBe(false)
  })

  it("keeps History and Repository available independently of AI Chat", () => {
    const availability = {
      aiChat: false,
      dbml: false,
      diagramProperties: false,
      history: true,
      repository: true,
    }

    expect(isRightPanelAvailable("history", availability)).toBe(true)
    expect(isRightPanelAvailable("repository", availability)).toBe(true)
  })

  it("closes modes that are not available in the current context", () => {
    const availability = {
      aiChat: true,
      dbml: false,
      diagramProperties: false,
      history: false,
      repository: false,
    }

    expect(isRightPanelAvailable("dbml", availability)).toBe(false)
    expect(isRightPanelAvailable("properties", availability)).toBe(false)
    expect(isRightPanelAvailable("history", availability)).toBe(false)
    expect(isRightPanelAvailable("repository", availability)).toBe(false)
    expect(isRightPanelAvailable("chat", availability)).toBe(true)
    expect(isRightPanelAvailable("closed", availability)).toBe(false)
  })
})
