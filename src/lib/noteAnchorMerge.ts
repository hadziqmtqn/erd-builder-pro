// Comment anchors are added by other Team members while the creator keeps typing (DATA-004).
// Only anchor-only differences can be rebased without losing another member's content.

const BLOCK = /<(p|h[1-6])\b([^>]*)>([\s\S]*?)<\/\1>/gi;
const ANCHOR = /\sdata-comment-anchor-id="([^"]+)"/i;

/**
 * Copies new server anchors only when all other HTML is identical. Null keeps the conflict and local draft.
 */
export function mergeServerCommentAnchors(serverHtml: string, draftHtml: string): string | null {
  const anchorAttributes = /\sdata-comment-anchor-id="[^"]*"/gi;
  if (serverHtml.replace(anchorAttributes, '') !== draftHtml.replace(anchorAttributes, '')) return null;
  const serverBlocks = [...serverHtml.matchAll(BLOCK)];
  let index = 0;
  let added = false;
  let conflict = false;
  const merged = draftHtml.replace(BLOCK, (whole, tag: string, attrs: string, inner: string) => {
    const serverId = serverBlocks[index++]?.[2].match(ANCHOR)?.[1];
    const draftId = attrs.match(ANCHOR)?.[1];
    if (!serverId || serverId === draftId) return whole;
    if (draftId) { conflict = true; return whole; }
    added = true;
    return `<${tag}${attrs} data-comment-anchor-id="${serverId}">${inner}</${tag}>`;
  });
  return added && !conflict ? merged : null;
}
