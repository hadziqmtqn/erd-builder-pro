interface RightChatSidebarProps {
  open: boolean;
  children: React.ReactNode;
}

/**
 * App-wide drawer for AI Chat, History and Repository (ERD-004).
 * It floats above the panes below the main header, so the layout behind it does not shrink.
 * Only the explicit close button (or toggle) closes it. Closed, it is hidden rather than removed, so the
 * AI conversation inside keeps its place and any reply in progress (BUG-050).
 */
export function RightChatSidebar({ open, children }: RightChatSidebarProps) {
  return (
    <aside hidden={!open} className="fixed right-3 top-19 bottom-3 z-40 flex w-96 max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-2xl animate-in slide-in-from-right duration-200">
      {children}
    </aside>
  );
}
