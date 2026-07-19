// ─── Chat message utility functions ──────────────────────────────────────────
// Extracted from ChatMessages.tsx — pure functions, no React dependencies.

/**
 * Extract JSON object from markdown code block, handling nested braces.
 * The naive regex `{[\s\S]*?}` fails on nested objects (stops at first `}`).
 */
function extractJsonObject(text: string, fromIndex = 0): string | null {
  const jsonStart = text.indexOf('{', fromIndex);
  if (jsonStart === -1) return null;

  let depth = 0;
  let quote: string | null = null;
  let escaped = false;

  for (let i = jsonStart; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '{') depth++;
    if (char === '}') depth--;
    if (depth === 0) return text.substring(jsonStart, i + 1);
  }

  return null;
}

function extractJsonFromCodeBlock(content: string): string | null {
  function firstFlowchartJson(text: string): string | null {
    let searchFrom = 0;
    while (searchFrom < text.length) {
      const json = extractJsonObject(text, searchFrom);
      if (!json) return null;
      try {
        const parsed = JSON.parse(json);
        if (parsed && Array.isArray(parsed.nodes)) return json;
      } catch { /* ignore */ }
      const nextStart = text.indexOf('{', searchFrom);
      if (nextStart === -1) return null;
      searchFrom = nextStart + 1;
    }
    return null;
  }

  for (const block of getCodeBlocks(content)) {
    const json = firstFlowchartJson(block);
    if (json) return json;
  }
  return firstFlowchartJson(content);
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

const DBML_KEYWORDS = /^\s*(?:Project|TableGroup|Table|Enum)\s+(?:"[^"]+"|[\w.]+)\s*\{|^\s*Ref\s*:/im;
const DBML_LINE_START = /^\s*(?:Project|TableGroup|Table|Enum)\s+(?:"[^"]+"|[\w.]+)\s*\{|^\s*Ref\s*:/i;

function getCodeBlocks(content: string): string[] {
  const blockRegex = /```[^\r\n]*\r?\n?([\s\S]*?)```/g;
  const blocks: string[] = [];
  let match;
  while ((match = blockRegex.exec(content)) !== null) {
    const block = match[1].trim();
    if (block) blocks.push(block);
  }
  return blocks;
}

function trimDBMLSnippet(text: string): string | null {
  const lines = text.split(/\r?\n/);
  const startIndex = lines.findIndex(line => DBML_LINE_START.test(line));
  if (startIndex === -1) return null;

  const result: string[] = [];
  let depth = 0;
  let started = false;

  for (let i = startIndex; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    const isSchemaStart = DBML_LINE_START.test(line);
    const isIgnorable = !trimmed || trimmed.startsWith('//');

    if (!started && !isSchemaStart && !isIgnorable) continue;
    if (started && depth === 0 && !isSchemaStart && !isIgnorable) break;

    started = true;
    result.push(line);

    for (const char of line) {
      if (char === '{') depth += 1;
      if (char === '}') depth = Math.max(0, depth - 1);
    }
  }

  const snippet = result.join('\n').trim();
  return DBML_KEYWORDS.test(snippet) ? snippet : null;
}

export function hasDBMLContent(content: string): boolean {
  return extractDBML(content) !== null;
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

export function extractDBML(content: string): string | null {
  const blocks: string[] = [];

  for (const block of getCodeBlocks(content)) {
    const dbml = trimDBMLSnippet(block);
    if (dbml) blocks.push(dbml);
  }

  if (blocks.length > 0) return blocks.join('\n\n');
  return trimDBMLSnippet(content);
}

export function hasSchemaContent(content: string): boolean {
  return hasDBMLContent(content) || hasSQLContent(content);
}

export function extractSchemaContent(content: string): string | null {
  return extractDBML(content) || extractSQL(content);
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
