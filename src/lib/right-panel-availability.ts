import type { RightPanelMode } from "@/contexts/AIActionContext"

interface RightPanelAvailability {
  aiChat: boolean
  dbml: boolean
  diagramProperties: boolean
  history: boolean
  repository: boolean
}

export function isRightPanelAvailable(mode: RightPanelMode, availability: RightPanelAvailability): boolean {
  switch (mode) {
    case "chat": return availability.aiChat
    case "dbml": return availability.dbml
    case "properties": return availability.diagramProperties
    case "history": return availability.history
    case "repository": return availability.repository
    default: return false
  }
}
