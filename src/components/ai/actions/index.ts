// ─── Types ─────────────────────────────────
export type { AIAction } from './types';
export { actionIcons } from './types';

// ─── Action Definition Configs ──────────────
export { erdActions } from './erdActionConfigs';
export { notesActions } from './notesActionConfigs';
export { flowchartActions } from './flowchartActionConfigs';

// ─── AI Content Apply Handlers ──────────────
export { applyToNoteContent } from './notesActions';
export { applyToErdContent } from './erdActions';
export { applyToFlowchartContent } from './flowchartActions';
