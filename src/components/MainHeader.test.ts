import { cloneElement, createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// The real popup mounts in a portal only after hydration; render it inline so the markup shows what the tooltip holds.
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ render, children }: { render: ReactElement; children: ReactNode }) => cloneElement(render, undefined, children),
  TooltipContent: ({ children }: { children: ReactNode }) => createElement('span', { 'data-tooltip': '' }, children),
}));

const { AIAssistantButton } = await import('./MainHeader');

const render = (props: Partial<Parameters<typeof AIAssistantButton>[0]> = {}) => {
  const html = renderToStaticMarkup(createElement(AIAssistantButton, {
    open: false,
    onToggle: vi.fn(),
    shortcut: { label: '⌘J', ariaKeyShortcuts: 'Meta+J' },
    ...props,
  }));
  const [button, tooltip] = html.split('</button>');
  return { button, tooltip };
};

describe('COL-009 AI Assistant header button', () => {
  it('shows the shortcut in the tooltip instead of inside the button', () => {
    const { button, tooltip } = render();
    expect(button).not.toContain('<kbd');
    expect(button).not.toContain('title="AI Assistant');
    expect(tooltip).toContain('AI Assistant');
    expect(tooltip).toMatch(/<kbd[^>]*>⌘J<\/kbd>/);
  });

  it('keeps the shortcut, pressed state and a name screen readers get at every width', () => {
    const { button } = render({ open: true });
    expect(button).toContain('aria-keyshortcuts="Meta+J"');
    expect(button).toContain('aria-pressed="true"');
    expect(button).toContain('class="sr-only sm:not-sr-only">AI Assistant</span>');
  });

  it('shows the answering spinner only while the panel is closed', () => {
    expect(render({ answering: true }).button).toContain('AI is still answering');
    expect(render({ answering: true, open: true }).button).not.toContain('AI is still answering');
  });
});
