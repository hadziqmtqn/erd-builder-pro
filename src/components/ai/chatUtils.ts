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

// ─── AI Response Cleanup ─────────────────────────────────────────────────────

const AI_FOOTER_PATTERNS: RegExp[] = [
  /\b(beri\s*tahu|kabari|let\s+me\s+know|tell\s+me|lmk)\b/i,
  /\b(gunakan|klik|click|use)\s+(tombol|button)\b/i,
  /\b(jika\s+ada|if\s+(you\s+(have|need|want)|there\s+is|anything))\b/i,
  /\b(jika\s+sudah\s+sesuai|if\s+(it|this|that)\s+(looks|is)\s+(good|correct|right|ok|okay))\b/i,
  /\b(semoga\s+membantu|hope\s+(this|it|that)\s+helps)\b/i,
  /\b(saya\s+siap|i'?m\s+(ready|here)|happy\s+to\s+help)\b/i,
  /\b(silahkan|feel\s+free|don'?t\s+hesitate)\b/i,
  /\b(^\*\*Catatan\*\*|^\*\*Note\*\*|^\*\*Tips?\*\*)/im,
];

/**
 * Strip AI preamble and footer fluff from responses.
 *
 * AI frequently wraps real content with:
 *   - Preamble: "Berikut adalah X yang telah diperbarui..." before ---
 *   - Footer: "Jika ada yang perlu diubah, gunakan tombol Replace..." after ---
 *
 * Heuristic:
 *   - Text before first \n---\n that is non-empty + shorter than 350 chars → preamble, strip it.
 *     An empty first segment means content starts with --- (real Markdown HR), so keep it.
 *   - Text after last \n---\n matching any AI_FOOTER_PATTERNS → footer, strip it.
 *
 * Only strips when at least 2 segments exist (actual content in middle).
 * Internal --- separators within the content body are always preserved.
 */
export function stripAiFluff(content: string): string {
  const HR = /\n---\n/;
  const parts = content.split(HR);

  if (parts.length < 2) return content.trim();

  // Strip preamble: first segment must be NON-EMPTY (content starting with ---
  // means first segment is "" — that's a real Markdown HR, not AI preamble)
  const first = parts[0].trim();
  if (first.length > 0 && first.length < 350) {
    parts.shift();
  }

  // Strip footer if last segment looks like AI closing
  if (parts.length >= 1) {
    const last = parts[parts.length - 1].trim();
    if (AI_FOOTER_PATTERNS.some(p => p.test(last))) {
      parts.pop();
    }
  }

  const result = parts.join('\n---\n').trim();
  // If stripping removed everything, return original
  return result || content.trim();
}
