import { useAIAction } from '@/contexts/AIActionContext';

interface RightChatSidebarProps {
  children: React.ReactNode;
}

/**
 * RightChatSidebar — sticky right sidebar container for AI Chat Panel.
 *
 * Fixed-position sidebar on the right side of the viewport, below the
 * main header. Does not resize or push the workspace area. Only the
 * explicit close button (or toggle) can close it.
 */
export function RightChatSidebar({ children }: RightChatSidebarProps) {
  const { rightPanelMode } = useAIAction();

  if (rightPanelMode === 'closed') return null;

  return (
    <aside className="fixed right-0 top-12 bottom-0 w-90 z-40 flex flex-col border-l border-border bg-card text-card-foreground shadow-xl animate-in slide-in-from-right duration-200">
      {children}
    </aside>
  );
}
