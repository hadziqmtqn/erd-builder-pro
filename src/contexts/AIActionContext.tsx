import { createContext, useContext, useCallback, useState, useRef, ReactNode } from 'react';

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
  registerContentHandler: (handler: (content: string, strategy: 'replace' | 'append' | 'replace-selection') => void) => () => void;
  /** Apply content using the registered handler. Returns true if successful. */
  applyContent: (content: string, strategy: 'replace' | 'append' | 'replace-selection') => boolean;
  /** Whether a content handler is currently registered (e.g. Notes view is active) */
  hasContentHandler: boolean;
  /** Current text selection from the active editor */
  selectionText: string | null;
  /** Update current selection text */
  setSelectionText: (text: string | null) => void;
  /** ProseMirror range of the current selection */
  selectionRange: { from: number; to: number } | null;
  /** Update selection range */
  setSelectionRange: (range: { from: number; to: number } | null) => void;
  /** Replace the selected range with content (registered by TiptapEditor). Returns new HTML. */
  replaceSelectedText: ((content: string) => string | undefined) | null;
  /** Register a callback to replace the selected range */
  registerReplaceSelected: (fn: (content: string) => string | undefined) => () => void;
}

const AIActionContext = createContext<AIActionContextValue | null>(null);

export function AIActionProvider({ children }: { children: ReactNode }) {
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingActionResult | null>(null);
  const [isAIOpen, setAIOpen] = useState(false);
  const [contentHandler, setContentHandler] = useState<((content: string, strategy: 'replace' | 'append' | 'replace-selection') => void) | null>(null);
  const [selectionText, setSelectionText] = useState<string | null>(null);
  const [selectionRange, setSelectionRange] = useState<{ from: number; to: number } | null>(null);
  const [replaceSelectedText, setReplaceSelectedText] = useState<((content: string) => string | undefined) | null>(null);

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

  const registerContentHandler = useCallback((handler: (content: string, strategy: 'replace' | 'append' | 'replace-selection') => void) => {
    setContentHandler(() => handler);
    return () => setContentHandler(null);
  }, []);

  const registerReplaceSelected = useCallback((fn: (content: string) => string | undefined) => {
    setReplaceSelectedText(fn);
    return () => setReplaceSelectedText(null);
  }, []);

  const applyContent = useCallback((content: string, strategy: 'replace' | 'append' | 'replace-selection') => {
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
        selectionText,
        setSelectionText,
        selectionRange,
        setSelectionRange,
        replaceSelectedText,
        registerReplaceSelected,
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
