import { useAIAction } from '@/contexts/AIActionContext';

interface RightChatSidebarProps {
  children: React.ReactNode;
}

/**
 * App-wide drawer for AI Chat, History and Repository (ERD-004).
 * It floats above the panes below the main header, so the layout behind it does not shrink.
 * Only the explicit close button (or toggle) closes it.
 */
export function RightChatSidebar({ children }: RightChatSidebarProps) {
  const { rightPanelMode } = useAIAction();

  if (rightPanelMode === 'closed') return null;

  return (
    <aside className="fixed right-3 top-15 bottom-3 z-40 flex w-96 max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-2xl animate-in slide-in-from-right duration-200">
      {children}
    </aside>
  );
}
