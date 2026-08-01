import React, { type ReactNode } from 'react';
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { Note } from '@/types';
import type { ExportOptions, PageSize } from './note-exporter';

const styles = StyleSheet.create({
  page: { padding: 36, fontFamily: 'Helvetica', fontSize: 10.5, color: '#18181b', lineHeight: 1.5 },
  title: { fontSize: 24, fontFamily: 'Helvetica-Bold', marginBottom: 8, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#e4e4e7' },
  meta: { color: '#71717a', fontSize: 8.5, marginBottom: 16 },
  h1: { fontSize: 22, fontFamily: 'Helvetica-Bold', marginTop: 24, marginBottom: 10 },
  h2: { fontSize: 18, fontFamily: 'Helvetica-Bold', marginTop: 20, marginBottom: 8 },
  h3: { fontSize: 14, fontFamily: 'Helvetica-Bold', marginTop: 16, marginBottom: 6 },
  h4: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginTop: 12, marginBottom: 5 },
  paragraph: { marginBottom: 7 },
  quote: { marginVertical: 8, borderLeftWidth: 3, borderLeftColor: '#d4d4d8', paddingLeft: 10, color: '#52525b', fontFamily: 'Helvetica-Oblique' },
  code: { fontFamily: 'Courier', fontSize: 9, color: '#be123c' },
  pre: { marginVertical: 8, padding: 10, borderRadius: 4, backgroundColor: '#18181b', color: '#f4f4f5', fontFamily: 'Courier', fontSize: 8.5 },
  listItem: { marginBottom: 3, paddingLeft: 12 },
  image: { maxWidth: '100%', marginVertical: 10 },
  table: { marginVertical: 8, borderTopWidth: 1, borderLeftWidth: 1, borderColor: '#d4d4d8' },
  row: { flexDirection: 'row' },
  cell: { flexGrow: 1, flexBasis: 0, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#d4d4d8', padding: 5 },
  headerCell: { backgroundColor: '#f4f4f5', fontFamily: 'Helvetica-Bold' },
});

function textStyle(element: Element): Record<string, string | number> {
  const style = element.getAttribute('style') || '';
  const color = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i)?.[1];
  const textAlign = style.match(/(?:^|;)\s*text-align\s*:\s*(left|center|right|justify)/i)?.[1];
  return { ...(color ? { color } : {}), ...(textAlign ? { textAlign } : {}) };
}

function inlineNodes(nodes: NodeListOf<ChildNode> | ChildNode[]): ReactNode[] {
  return Array.from(nodes).map((node, index) => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (!(node instanceof Element)) return null;
    const children = inlineNodes(node.childNodes);
    const style = textStyle(node);
    switch (node.tagName.toLowerCase()) {
      case 'strong': case 'b': return <Text key={index} style={[style, { fontFamily: 'Helvetica-Bold' }]}>{children}</Text>;
      case 'em': case 'i': return <Text key={index} style={[style, { fontFamily: 'Helvetica-Oblique' }]}>{children}</Text>;
      case 'u': return <Text key={index} style={[style, { textDecoration: 'underline' }]}>{children}</Text>;
      case 's': case 'del': return <Text key={index} style={[style, { textDecoration: 'line-through' }]}>{children}</Text>;
      case 'code': return <Text key={index} style={[styles.code, style]}>{children}</Text>;
      case 'br': return '\n';
      default: return <Text key={index} style={style}>{children}</Text>;
    }
  });
}

function listItems(list: Element, depth = 0): ReactNode[] {
  return Array.from(list.children).filter((item) => item.tagName.toLowerCase() === 'li').flatMap((item, index) => {
    const nested = Array.from(item.children).filter((child) => ['ul', 'ol'].includes(child.tagName.toLowerCase()));
    const content = Array.from(item.childNodes).filter((child) => !(child instanceof Element && ['ul', 'ol'].includes(child.tagName.toLowerCase())));
    const task = item.getAttribute('data-type') === 'taskItem';
    const checked = item.getAttribute('data-checked') === 'true';
    return [
      <Text key={`item-${index}`} style={[styles.listItem, { marginLeft: depth * 12 }, checked ? { color: '#71717a', textDecoration: 'line-through' } : {}]}>
        {task ? `${checked ? '☑' : '☐'} ` : `${list.tagName.toLowerCase() === 'ol' ? `${index + 1}.` : '•'} `}{inlineNodes(content)}
      </Text>,
      ...nested.flatMap((child) => listItems(child, depth + 1)),
    ];
  });
}

function table(tableElement: Element, key: number): ReactNode {
  const rows = Array.from(tableElement.querySelectorAll('tr'));
  return <View key={key} style={styles.table} wrap={false}>{rows.map((row, rowIndex) => (
    <View key={rowIndex} style={styles.row}>{Array.from(row.querySelectorAll(':scope > th, :scope > td')).map((cell, cellIndex) => (
      <Text key={cellIndex} style={[styles.cell, cell.tagName.toLowerCase() === 'th' ? styles.headerCell : {}]}>{cell.textContent}</Text>
    ))}</View>
  ))}</View>;
}

function blockNodes(content: string): ReactNode[] {
  const root = new DOMParser().parseFromString(content, 'text/html').body;
  return Array.from(root.childNodes).flatMap((node, index) => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent?.trim() ? <Text key={index} style={styles.paragraph}>{node.textContent}</Text> : [];
    if (!(node instanceof Element)) return [];
    const tag = node.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) return <Text key={index} style={[styles[tag as 'h1' | 'h2' | 'h3' | 'h4'] ?? styles.h4, textStyle(node)]}>{inlineNodes(node.childNodes)}</Text>;
    if (tag === 'p' || tag === 'div') return <Text key={index} style={[styles.paragraph, textStyle(node)]}>{inlineNodes(node.childNodes)}</Text>;
    if (tag === 'blockquote') return <Text key={index} style={[styles.quote, textStyle(node)]}>{inlineNodes(node.childNodes)}</Text>;
    if (tag === 'pre') return <Text key={index} style={styles.pre}>{node.textContent}</Text>;
    if (tag === 'ul' || tag === 'ol') return <View key={index}>{listItems(node)}</View>;
    if (tag === 'img' && node.getAttribute('src')) return <Image key={index} src={node.getAttribute('src')!} style={styles.image} />;
    if (tag === 'table') return table(node, index);
    if (tag === 'hr') return <View key={index} style={{ borderTopWidth: 1, borderTopColor: '#e4e4e7', marginVertical: 10 }} />;
    return <Text key={index} style={styles.paragraph}>{node.textContent}</Text>;
  });
}

export function createNotePdfDocument({ note, options, content, pageSize, projectName }: { note: Note; options: ExportOptions; content: string; pageSize: PageSize; projectName?: string }): React.ReactElement<React.ComponentProps<typeof Document>> {
  return <Document title={note.title} author="ERD Builder Pro"><Page size={pageSize.toUpperCase() as 'A4' | 'LETTER'} style={styles.page}>
    {options.includeTitle && <Text style={styles.title}>{note.title}</Text>}
    {options.includeMetadata && <Text style={styles.meta}>Project: {projectName || note.projects?.name || 'Untitled'} · Updated: {new Date(note.updated_at).toLocaleDateString()}</Text>}
    {blockNodes(content)}
  </Page></Document>;
}
