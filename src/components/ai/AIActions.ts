import { AIAction, actionIcons } from './actions/types';
import { erdActions } from './actions/erdActionConfigs';
import { notesActions } from './actions/notesActionConfigs';
import { flowchartActions } from './actions/flowchartActionConfigs';
import { dbClientActions } from './actions/dbClientActionConfigs';
import { grillMeAction } from './actions/grillMeActionConfig';

// ─── Re-export for external consumers ─────────────────
export type { AIAction };
export { actionIcons };
export { grillMeAction };

// ─── Registry ─────────────────────────────────────────

export const actionsRegistry: Record<string, AIAction[]> = {
  erd: erdActions,
  notes: notesActions,
  flowchart: flowchartActions,
  'db-client': dbClientActions,
};

export type ViewType = keyof typeof actionsRegistry;

export function getActionsForView(view: ViewType): AIAction[] {
  return actionsRegistry[view] || [];
}
