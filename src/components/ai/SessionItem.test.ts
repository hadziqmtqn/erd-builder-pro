import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SessionItem } from './SessionItem';
import type { AIChatSession } from '@/types';

const session = { id: 1, uid: 'session-1', title: 'Shared QA conversation' } as AIChatSession;

describe('SH-002 conversation list controls', () => {
  it('keeps a shared conversation readable without offering deletion', () => {
    const html = renderToStaticMarkup(createElement(SessionItem, { session, isActive: false, onClick: vi.fn() }));
    expect(html).toContain('Shared QA conversation');
    expect(html).toContain('role="button"');
    expect(html).not.toContain('Delete session');
  });

  it('offers the existing delete action when the creator callback is supplied', () => {
    const html = renderToStaticMarkup(createElement(SessionItem, { session, isActive: false, onClick: vi.fn(), onDelete: vi.fn() }));
    expect(html).toContain('Delete session');
  });
});

describe('BUG-050 answering marker', () => {
  it('replaces the time with a small spinner while the AI answers', () => {
    const html = renderToStaticMarkup(createElement(SessionItem, { session: { ...session, updated_at: new Date().toISOString() }, isActive: false, answering: true, onClick: vi.fn() }));
    expect(html).toContain('title="AI is answering"');
    expect(html).toContain('animate-spin');
    expect(html).not.toContain('just now');
  });

  it('shows the time when nothing is being answered', () => {
    const html = renderToStaticMarkup(createElement(SessionItem, { session: { ...session, updated_at: new Date().toISOString() }, isActive: false, onClick: vi.fn() }));
    expect(html).toContain('just now');
    expect(html).not.toContain('AI is answering');
  });
});
