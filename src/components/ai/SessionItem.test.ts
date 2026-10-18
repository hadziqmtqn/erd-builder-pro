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
