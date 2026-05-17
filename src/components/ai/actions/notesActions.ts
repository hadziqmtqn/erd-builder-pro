// ─── Note AI Action Handlers ─────────────────────────────
// Applies AI response back to note content based on action type.
// Each action has a different merge strategy:
//   - summarize / generate-docs → append to existing content
//   - improve-grammar → replace content (AI response is the corrected version)

export function applyToNoteContent(
  originalContent: string,
  actionId: string,
  aiResponse: string
): string {
  switch (actionId) {
    case 'notes-summarize':
      return originalContent
        ? `${originalContent}\n\n---\n## Summary\n${aiResponse}`
        : `## Summary\n${aiResponse}`;

    case 'notes-improve-grammar':
      // AI returns the polished/corrected version — replace content
      return aiResponse;

    case 'notes-generate-docs':
      return originalContent
        ? `${originalContent}\n\n---\n## Documentation\n${aiResponse}`
        : `## Documentation\n${aiResponse}`;

    default:
      // Unknown action: append as-is
      return originalContent
        ? `${originalContent}\n\n${aiResponse}`
        : aiResponse;
  }
}
