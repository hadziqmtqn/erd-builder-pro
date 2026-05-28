// ─── Chat message utility functions ──────────────────────────────────────────
// Extracted from ChatMessages.tsx — pure functions, no React dependencies.

/**
 * Extract JSON object from markdown code block, handling nested braces.
 * The naive regex `{[\s\S]*?}` fails on nested objects (stops at first `}`).
 */
function extractJsonFromCodeBlock(content: string): string | null {
  const blockStartRegex = /```(?:json)?\s*\{/g;
  let match;
  while ((match = blockStartRegex.exec(content)) !== null) {
    const jsonStart = match.index + match[0].length - 1; // position of the opening `{`
    let depth = 0;
    for (let i = jsonStart; i < content.length; i++) {
      if (content[i] === '{') depth++;
      else if (content[i] === '}') depth--;
      if (depth === 0) {
        return content.substring(jsonStart, i + 1);
      }
    }
  }
  return null;
}

export function hasFlowchartJSON(content: string): boolean {
  // Try brace-balanced extraction from code blocks first
  const json = extractJsonFromCodeBlock(content);
  if (json) {
    try {
      const parsed = JSON.parse(json);
      if (parsed && Array.isArray(parsed.nodes)) return true;
    } catch { /* ignore */ }
  }
  // Fallback: entire content is JSON
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
  // Try brace-balanced extraction from code blocks first
  const json = extractJsonFromCodeBlock(content);
  if (json) {
    try {
      const parsed = JSON.parse(json);
      if (parsed && Array.isArray(parsed.nodes)) return json.trim();
    } catch { /* ignore */ }
  }
  // Fallback: entire content is JSON
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
