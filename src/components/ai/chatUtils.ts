// ─── Chat message utility functions ──────────────────────────────────────────
// Extracted from ChatMessages.tsx — pure functions, no React dependencies.

export function hasFlowchartJSON(content: string): boolean {
  const blockRegex = /```(?:json)?\s*({[\s\S]*?})\s*```/g;
  let match;
  while ((match = blockRegex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed && Array.isArray(parsed.nodes)) return true;
    } catch { /* ignore */ }
  }
  try {
    const parsed = JSON.parse(content.trim());
    if (parsed && Array.isArray(parsed.nodes)) return true;
  } catch { /* ignore */ }
  return false;
}

export function hasSQLContent(content: string): boolean {
  const sqlKeywords = /\b(CREATE\s+TABLE|ALTER\s+TABLE|INSERT\s+INTO)\b/i;
  const blockRegex = /```(?:\w*)\n?([\s\S]*?)```/g;
  let match;
  while ((match = blockRegex.exec(content)) !== null) {
    if (sqlKeywords.test(match[1])) return true;
  }
  if (sqlKeywords.test(content)) return true;
  return false;
}

export function extractSQL(content: string): string | null {
  const sqlKeywords = /\b(CREATE\s+TABLE|ALTER\s+TABLE|INSERT\s+INTO)\b/i;
  const blockRegex = /```(?:\w*)\n?([\s\S]*?)```/g;
  let match;
  const blocks: string[] = [];
  while ((match = blockRegex.exec(content)) !== null) {
    if (sqlKeywords.test(match[1])) {
      blocks.push(match[1].trim());
    }
  }
  if (blocks.length > 0) return blocks.join('\n\n');
  if (sqlKeywords.test(content)) return content.trim();
  return null;
}

export function extractFlowchartJSON(content: string): string | null {
  const blockRegex = /```(?:json)?\s*({[\s\S]*?})\s*```/g;
  let match;
  while ((match = blockRegex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed && Array.isArray(parsed.nodes)) return match[1].trim();
    } catch { /* ignore */ }
  }
  try {
    const parsed = JSON.parse(content.trim());
    if (parsed && Array.isArray(parsed.nodes)) return content.trim();
  } catch { /* ignore */ }
  return null;
}

export function formatTime(dateStr?: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
