const IMAGE_PLACEHOLDER_PREFIX = '[Image';

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatLink(text: string, href: string | null): string {
  const label = normalizeWhitespace(text);
  const url = href?.trim();

  if (!url) return label;
  if (!label || label === url) return url;

  return `${label} (${url})`;
}

function formatImage(img: HTMLImageElement, index: number): string {
  const src = img.getAttribute('src')?.trim() || '';
  const alt = img.getAttribute('alt')?.trim();
  const title = img.getAttribute('title')?.trim();
  const label = alt || title || `image ${index}`;

  if (!src) return `${IMAGE_PLACEHOLDER_PREFIX}: ${label}]`;
  return `${IMAGE_PLACEHOLDER_PREFIX}: ${label}] ${src}`;
}

function nodeToText(node: Node, state: { imageIndex: number }): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || '';
  }

  if (!(node instanceof HTMLElement)) {
    return '';
  }

  const tag = node.tagName.toLowerCase();

  if (tag === 'script' || tag === 'style') return '';

  if (tag === 'br') return '\n';

  if (tag === 'img') {
    state.imageIndex += 1;
    return formatImage(node as HTMLImageElement, state.imageIndex);
  }

  if (tag === 'a') {
    return formatLink(childrenToText(node, state), node.getAttribute('href'));
  }

  if (tag === 'li') {
    const isTaskItem = node.getAttribute('data-type') === 'taskItem';
    if (isTaskItem) {
      const checked = node.getAttribute('data-checked') === 'true' ? 'x' : ' ';
      return `- [${checked}] ${normalizeWhitespace(childrenToText(node, state))}`;
    }
    return `- ${normalizeWhitespace(childrenToText(node, state))}`;
  }

  if (tag === 'tr') {
    const cells = Array.from(node.children)
      .filter(child => ['td', 'th'].includes(child.tagName.toLowerCase()))
      .map(cell => normalizeWhitespace(childrenToText(cell, state)));
    return cells.length ? `| ${cells.join(' | ')} |` : '';
  }

  if (tag === 'table') {
    const rows = Array.from(node.querySelectorAll('tr')).map(row => nodeToText(row, state)).filter(Boolean);
    return rows.join('\n');
  }

  const content = childrenToText(node, state);

  if (/^h[1-6]$/.test(tag)) return `\n${normalizeWhitespace(content)}\n`;
  if (['p', 'div', 'section', 'article', 'blockquote', 'pre'].includes(tag)) return `\n${normalizeWhitespace(content)}\n`;
  if (['ul', 'ol'].includes(tag)) return `\n${content}\n`;

  return content;
}

function childrenToText(element: Element, state: { imageIndex: number }): string {
  return Array.from(element.childNodes).map(child => nodeToText(child, state)).join('');
}

export function htmlToAIText(html: string): string {
  if (!html) return '';

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const text = childrenToText(doc.body, { imageIndex: 0 });

  return normalizeWhitespace(text);
}
