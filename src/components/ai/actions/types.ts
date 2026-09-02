export interface AIAction {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  /** Keep this action active for each reply until the user turns it off. */
  persistent?: boolean;
  /** Actions such as Grill Me can run without an open workspace file. */
  requiresEntityContext?: boolean;
  buildPrompt: (context: Record<string, any>) => string;
}

export const actionIcons: Record<string, string> = {
  'erd-edit-column': 'columns',
  'erd-explain-table': 'info',
  'erd-suggest-indexes': 'zap',
  'erd-seed-data': 'file',
  'notes-summarize': 'align-left',
  'notes-improve-grammar': 'spell-check',
  'notes-generate-docs': 'file-text',
  'flowchart-explain': 'info',
  'flowchart-pseudocode': 'code',
  'flowchart-generate': 'plus',
};
