import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { SidebarProvider } from '@/components/ui/sidebar';
import { NotificationBell } from './NotificationBell';

const screen = vi.hoisted(() => ({ mobile: false, unread: 0 }));
const useNotifications = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => screen.mobile }));
vi.mock('@/hooks/useNotifications', () => ({ useNotifications }));

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

  it('shows the count in the wide sidebar and a dot in the rail', () => {
    const html = render(false, 150);
    expect(html).toContain('aria-label="Notifications, 150 unread"');
    expect(html).toContain('title="Notifications"');
    // SidebarMenuBadge hides itself in the rail; the dot shows only there.
    expect(html).toMatch(/data-sidebar="menu-badge"[^>]*>99\+</);
    expect(html).toMatch(/data-unread-dot=""[^>]*class="[^"]*\bhidden\b[^"]*group-data-\[collapsible=icon\]:block/);
  });

  it('shows neither count nor dot when everything is read', () => {
    const html = render(false, 0);
    expect(html).toContain('aria-label="Notifications"');
    expect(html).not.toContain('data-sidebar="menu-badge"');
    expect(html).not.toContain('data-unread-dot');
  });

  it('keeps the header icon badge on narrow screens', () => {
    const html = headerPart(render(true, 150));
    expect(html).toContain('>99+</');
    expect(html).not.toContain('data-unread-dot');
  });
});
