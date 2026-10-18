import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ allowed: false }));
vi.mock('react', async original => {
  const react = await original<typeof import('react')>();
  return { ...react, useState: (initial: any) => react.useState(initial === 'list' ? 'chat' : initial) };
});
vi.mock('@/hooks/useAIChat', () => ({ useAIChat: () => ({
  sessions: [], currentSession: { id: 1, uid: 'shared', title: 'Shared QA' },
  messages: [], allMessages: [], isStreaming: false,
  canManageSession: () => state.allowed,
  sendMessage: vi.fn(),
}) }));
vi.mock('@/contexts/AIActionContext', () => ({ useAIAction: () => ({
  contentHandlerStrategies: [], actionContextData: {},
}) }));
vi.mock('./ChatMessages', () => ({ ChatMessages: () => createElement('div', null, 'Stored shared response') }));
vi.mock('./ChatInput', () => ({ ChatInput: () => createElement('button', null, 'Send message') }));
vi.mock('./PlanInterviewCard', () => ({ PlanInterviewCard: () => createElement('button', null, 'Plan answer') }));
vi.mock('./SelectionBar', () => ({ SelectionBar: () => null }));
vi.mock('@/components/ConfirmModal', () => ({ default: () => null }));

import { AIChatPanel } from './AIChatPanel';

describe('SH-002 shared conversation composer', () => {
  it('renders shared messages and a read-only notice without send or Plan controls', () => {
    state.allowed = false;
    const html = renderToStaticMarkup(createElement(AIChatPanel, { onClose: vi.fn() }));
    expect(html).toContain('Stored shared response');
    expect(html).toContain('This conversation is read-only');
    expect(html).not.toContain('Send message');
    expect(html).not.toContain('Plan answer');
  });

  it('keeps send and Plan controls for the creator', () => {
    state.allowed = true;
    const html = renderToStaticMarkup(createElement(AIChatPanel, { onClose: vi.fn() }));
    expect(html).toContain('Send message');
    expect(html).toContain('Plan answer');
    expect(html).not.toContain('This conversation is read-only');
  });
});
