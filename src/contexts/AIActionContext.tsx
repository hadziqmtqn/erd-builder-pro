import { createContext, useContext, useCallback, useState, ReactNode } from 'react';

interface AIActionContextValue {
  /** Send an AI action prompt — opens chat panel and injects prompt */
  sendAction: (prompt: string) => void;
  /** Current pending prompt (consumed by AIChatPanel) */
  pendingPrompt: string | null;
  /** Clear the pending prompt after use */
  clearPrompt: () => void;
  /** Open/close state for the AI panel */
  isAIOpen: boolean;
  /** Toggle the AI panel */
  setAIOpen: (open: boolean) => void;
}

const AIActionContext = createContext<AIActionContextValue | null>(null);

export function AIActionProvider({ children }: { children: ReactNode }) {
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [isAIOpen, setAIOpen] = useState(false);

  const sendAction = useCallback((prompt: string) => {
    setPendingPrompt(prompt);
    setAIOpen(true);
  }, []);

  const clearPrompt = useCallback(() => {
    setPendingPrompt(null);
  }, []);

  return (
    <AIActionContext.Provider value={{ sendAction, pendingPrompt, clearPrompt, isAIOpen, setAIOpen }}>
      {children}
    </AIActionContext.Provider>
  );
}

export function useAIAction(): AIActionContextValue {
  const ctx = useContext(AIActionContext);
  if (!ctx) {
    throw new Error('useAIAction must be used within an AIActionProvider');
  }
  return ctx;
}
