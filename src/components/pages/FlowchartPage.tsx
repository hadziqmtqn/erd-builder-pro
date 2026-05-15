import React from 'react';

/**
 * FlowchartPage — manages Flowchart-specific side effects.
 *
 * Mounted unconditionally inside WorkspaceProvider. Renders null (no visible DOM).
 * Handles:
 *  - [placeholder] Will hold flowchart-specific logic (shortcuts, cleanup, etc.)
 *
 * Breadcrumb is handled by useAppMetadata (activeFileName) — no override needed.
 */
export const FlowchartPage = React.memo(function FlowchartPage() {
  // Placeholder for future flowchart-specific side effects

  return null;
});
