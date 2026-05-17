import { createContext, useContext, useCallback, useState, ReactNode } from 'react';

export interface PendingActionResult {
  actionId: string;
  onResult: (response: string) => void;
}

interface AIActionContextValue {
  /** Send an AI action prompt — opens chat panel and injects prompt */
  sendAction: (prompt: string, actionId?: string, onResult?: (response: string) => void) => void;
  /** Current pending prompt (consumed by AIChatPanel) */
  pendingPrompt: string | null;
  /** Pending action result handler (consumed by AIChatPanel after stream) */
  pendingAction: PendingActionResult | null;
  /** Clear the pending prompt after use */
  clearPrompt: () => void;
  /** Clear the pending action after stream completes */
  clearPendingAction: () => void;
  /** Open/close state for the AI panel */
  isAIOpen: boolean;
  /** Toggle the AI panel */
  setAIOpen: (open: boolean) => void;
  /** Register a global handler for manually applying content to the active view */
  registerContentHandler: (handler: (content: string, strategy: 'replace' | 'append') => void) => () => void;
  /** Apply content using the registered handler. Returns true if successful. */
  applyContent: (content: string, strategy: 'replace' | 'append') => boolean;
  /** Whether a content handler is currently registered (e.g. Notes view is active) */
  hasContentHandler: boolean;
}

const AIActionContext = createContext<AIActionContextValue | null>(null);

export function AIActionProvider({ children }: { children: ReactNode }) {
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingActionResult | null>(null);
  const [isAIOpen, setAIOpen] = useState(false);
  const [contentHandler, setContentHandler] = useState<((content: string, strategy: 'replace' | 'append') => void) | null>(null);

  const sendAction = useCallback(
    (prompt: string, actionId?: string, onResult?: (response: string) => void) => {
      setPendingPrompt(prompt);
      if (actionId && onResult) {
        setPendingAction({ actionId, onResult });
      } else {
        // Clear any stale action when sending plain prompts
        setPendingAction(null);
      }
      setAIOpen(true);
    },
    [],
  );

  const clearPrompt = useCallback(() => {
    setPendingPrompt(null);
  }, []);

  const clearPendingAction = useCallback(() => {
    setPendingAction(null);
  }, []);

  const registerContentHandler = useCallback((handler: (content: string, strategy: 'replace' | 'append') => void) => {
    setContentHandler(() => handler);
    return () => setContentHandler(null);
  }, []);

  const applyContent = useCallback((content: string, strategy: 'replace' | 'append') => {
    if (contentHandler) {
      contentHandler(content, strategy);
      return true;
    }
    return false;
  }, [contentHandler]);

  return (
    <AIActionContext.Provider
      value={{
        sendAction,
        pendingPrompt,
        pendingAction,
        clearPrompt,
        clearPendingAction,
        isAIOpen,
        setAIOpen,
        registerContentHandler,
        applyContent,
        hasContentHandler: !!contentHandler,
      }}
    >
      {children}
    </AIActionContext.Provider>
  );
}

export function useAIAction(): AIActionContextValue {
  const ctx = useContext(AIActionContext);
  if (!ctx) {
    throw new Error('useAIAction must be used within AIActionProvider');
  }
  return ctx;
}
