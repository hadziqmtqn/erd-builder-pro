import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { SidebarProvider } from '@/components/ui/sidebar';
import { NotificationBell, selectedScopeTab } from './NotificationBell';

const screen = vi.hoisted(() => ({ mobile: false, unread: 0 }));
const useNotifications = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => screen.mobile }));
vi.mock('@/hooks/useNotifications', () => ({ useNotifications }));
// Records each popover's props; the real PopoverContent still renders.
const popoverProps = vi.hoisted(() => [] as Array<{ initialFocus?: unknown }>);
vi.mock('@/components/ui/popover', async (importOriginal) => {
  const { createElement: h } = await import('react');
  const actual = await importOriginal<typeof import('@/components/ui/popover')>();
  return {
    ...actual,
    PopoverContent: (props: Parameters<typeof actual.PopoverContent>[0]) => {
      popoverProps.push(props);
      return h(actual.PopoverContent, props);
    },
  };
});

// AppLayout renders the bell in both slots, as here; the sidebar mode decides which one mounts.
const render = (mobile: boolean, unread = 0) => {
  screen.mobile = mobile;
  screen.unread = unread;
  useNotifications.mockReset().mockImplementation(() => ({
    items: [], unreadCount: screen.unread, status: 'ready', refresh: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn(),
  }));
  const bell = (placement: 'header' | 'sidebar') => createElement(NotificationBell, { placement, activeTeamId: null, onSelectWorkspace: async () => {} });
  return renderToStaticMarkup(createElement(MemoryRouter, null,
    createElement(SidebarProvider, null, createElement('ul', null, bell('sidebar')), createElement('header', null, bell('header')))));
};
const headerPart = (html: string) => html.slice(html.indexOf('<header'));

describe('COL-009 notification bell placement', () => {
  it('mounts one bell, in the sidebar from 768px up', () => {
    const html = render(false, 3);
    expect(useNotifications).toHaveBeenCalledTimes(1);
    expect(html).toContain('data-sidebar="menu-button"');
    expect(headerPart(html)).not.toContain('Notifications');
  });

  it('mounts one bell, in the header while the sidebar is a Sheet', () => {
    const html = render(true, 3);
    expect(useNotifications).toHaveBeenCalledTimes(1);
    expect(html).not.toContain('data-sidebar="menu-button"');
    expect(headerPart(html)).toContain('aria-label="Notifications, 3 unread"');
  });

  // SidebarMenuBadge hides itself in the rail; the rail count shows only there.
  const railCount = (html: string) => {
    const [tag = '', text] = html.match(/<span[^>]*data-rail-count=""[^>]*>([^<]*)</) ?? [];
    return { classes: (tag.match(/class="([^"]*)"/)?.[1] ?? '').split(' '), text };
  };

  it('shows up to 99+ in the wide sidebar and up to 9+ on the rail icon', () => {
    const html = render(false, 150);
    expect(html).toContain('aria-label="Notifications, 150 unread"');
    expect(html).toContain('title="Notifications"');
    expect(html).toMatch(/data-sidebar="menu-badge"[^>]*>99\+</);
    const rail = railCount(html);
    expect(rail.text).toBe('9+');
    expect(rail.classes).toEqual(expect.arrayContaining(['hidden', 'group-data-[collapsible=icon]:inline-flex']));
  });

  it('shows a single-digit count as it is on both', () => {
    const html = render(false, 7);
    expect(html).toContain('aria-label="Notifications, 7 unread"');
    expect(html).toMatch(/data-sidebar="menu-badge"[^>]*>7</);
    expect(railCount(html).text).toBe('7');
  });

  it('shows no badge in the sidebar or on the rail when everything is read', () => {
    const html = render(false, 0);
    expect(html).toContain('aria-label="Notifications"');
    expect(html).not.toContain('data-sidebar="menu-badge"');
    expect(html).not.toContain('data-rail-count');
  });

  it('keeps the header icon badge on narrow screens', () => {
    const html = headerPart(render(true, 150));
    expect(html).toContain('>99+</');
    expect(html).not.toContain('data-rail-count');
  });
});

describe('BUG-080 bell popover initial focus', () => {
  it('sets the initial focus in the sidebar and in the header, never to the default first button', () => {
    for (const mobile of [false, true]) {
      popoverProps.length = 0;
      render(mobile, 3);
      expect(popoverProps).toHaveLength(1);
      expect(popoverProps[0].initialFocus).toBeTypeOf('function');
      // Without a browser the scope tabs are not mounted, so focus stays put instead of falling to Mark all as read.
      expect((popoverProps[0].initialFocus as () => unknown)()).toBe(false);
    }
  });

  it('picks the selected scope tab', () => {
    const tab = {} as HTMLElement;
    const root = { querySelector: (selector: string) => (selector === '[role="tab"][aria-selected="true"]' ? tab : null) } as unknown as ParentNode;
    expect(selectedScopeTab(root)).toBe(tab);
    expect(selectedScopeTab(null)).toBe(false);
  });
});
