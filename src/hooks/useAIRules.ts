import { useState, useCallback, useRef, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

export type ViewType = 'erd' | 'notes' | 'flowchart';

interface AIRulesData {
  id?: string;
  view_type: ViewType;
  content: string;
  is_enabled: boolean;
}

export function useAIRules(viewType: ViewType | null) {
  const auth = useAuth();
  const [rules, setRules] = useState<AIRulesData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const fetchedRef = useRef<string | null>(null);

  const fetchRules = useCallback(async () => {
    if (!viewType) return;
    const key = `${auth.user?.id || 'guest'}:${viewType}`;
    if (fetchedRef.current === key) return;
    fetchedRef.current = key;

    if (auth.isGuest) {
      try {
        const stored = localStorage.getItem(`ai_rules_${viewType}`);
        if (stored) setRules(JSON.parse(stored));
      } catch {}
      return;
    }

    setIsLoading(true);
    try {
      const res = await apiFetch(`/api/ai/rules/${viewType}`);
      if (res.ok) {
        const data = await res.json();
        setRules(data);
      }
    } catch {}
    setIsLoading(false);
  }, [viewType, auth.user?.id, auth.isGuest]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const saveRules = useCallback(async (content: string, isEnabled?: boolean) => {
    if (!viewType) return;

    const enabled = isEnabled ?? rules?.is_enabled ?? true;

    if (auth.isGuest) {
      const data: AIRulesData = { view_type: viewType, content, is_enabled: enabled };
      try {
        localStorage.setItem(`ai_rules_${viewType}`, JSON.stringify(data));
      } catch {}
      setRules(data);
      return;
    }

    setIsSaving(true);
    try {
      const res = await apiFetch(`/api/ai/rules/${viewType}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, is_enabled: enabled }),
      });
      if (res.ok) {
        const data = await res.json();
        setRules(data);
      }
    } catch {}
    setIsSaving(false);
  }, [viewType, auth.isGuest, rules?.is_enabled]);

  return {
    rules,
    isLoading,
    isSaving,
    saveRules,
  };
}
