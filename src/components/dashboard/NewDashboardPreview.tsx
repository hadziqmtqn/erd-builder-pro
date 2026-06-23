import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Bot,
  Send,
  StickyNote,
  Database,
  Network,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';
import { ChatFlowPreview } from './ChatFlowPreview';

type DocType = 'note' | 'erd' | 'flowchart';

const featureOptions: {
  type: DocType;
  label: string;
  icon: typeof StickyNote;
  color: string;
  bg: string;
}[] = [
  { type: 'note', label: 'Notes', icon: StickyNote, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  { type: 'erd', label: 'ERD Builder', icon: Database, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { type: 'flowchart', label: 'Flowchart', icon: Network, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
];

interface SuggestionItem {
  icon: typeof StickyNote;
  label: string;
  desc: string;
  type: DocType;
}

const allSuggestions: SuggestionItem[] = [
  { icon: StickyNote, label: 'Write project docs', desc: 'Create comprehensive documentation', type: 'note' },
  { icon: StickyNote, label: 'Meeting notes', desc: 'Capture meeting minutes and action items', type: 'note' },
  { icon: StickyNote, label: 'API reference draft', desc: 'Draft API endpoints and usage', type: 'note' },
  { icon: Database, label: 'Design users table', desc: 'User management schema with roles', type: 'erd' },
  { icon: Database, label: 'E-commerce DB', desc: 'Model products, orders, inventory', type: 'erd' },
  { icon: Database, label: 'Import from SQL', desc: 'Generate ERD from existing schema', type: 'erd' },
  { icon: Network, label: 'Login flow chart', desc: 'Authentication authorization flow', type: 'flowchart' },
  { icon: Network, label: 'CI/CD pipeline', desc: 'Build, test, and deploy stages', type: 'flowchart' },
  { icon: Network, label: 'Decision tree', desc: 'Branching logic and decisions', type: 'flowchart' },
];

export function NewDashboardPreview() {
  const [activeFeature, setActiveFeature] = useState<DocType>('note');
  const [inputValue, setInputValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const filteredSuggestions = allSuggestions.filter(s => s.type === activeFeature);

  const MIN_HEIGHT = 80;
  const MAX_HEIGHT = 240;

  const handleInput = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = `${MIN_HEIGHT}px`;
    const newHeight = Math.min(Math.max(ta.scrollHeight, MIN_HEIGHT), MAX_HEIGHT);
    ta.style.height = `${newHeight}px`;
    ta.style.overflowY = newHeight >= MAX_HEIGHT ? 'auto' : 'hidden';
  }, []);

  const handleSuggestionClick = useCallback((label: string) => {
    setInputValue(label);
    textareaRef.current?.focus();
    // Trigger auto-resize after state update
    requestAnimationFrame(() => handleInput());
  }, [handleInput]);

  const handleSend = useCallback(() => {
    if (!inputValue.trim()) return;
  }, [inputValue]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // Initial sizing on mount
  useEffect(() => { handleInput(); }, [handleInput]);

  return (
    <div className="flex h-full w-full flex-col items-center overflow-y-auto">
      {/* ── Alert Banner ── */}
      <div className="w-full max-w-4xl px-6 mb-6">
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3.5">
          <AlertTriangle className="size-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Dashboard AI — Preview</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              This page is not yet functional. Use the AI Chat panel from the sidebar for active AI features.
            </p>
          </div>
        </div>
      </div>

      {/* ── Hero ── */}
      <div className="flex flex-col items-center text-center px-6 mb-6">
        <div className="size-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
          <Bot className="size-6 text-primary" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">What would you like to create?</h1>
        <p className="text-sm text-muted-foreground mt-1.5">
          Notes, ERD diagrams, or flowcharts — describe it and we'll help you start
        </p>
      </div>

      {/* ── Chat Flow Preview ── */}
      <ChatFlowPreview />

      {/* ── Try it input ── */}
      <div className="flex w-full max-w-4xl flex-col items-center gap-5 px-6 mt-2">

        {/* ── Textarea ── */}
        <div className="w-full max-w-4xl flex items-end gap-2 rounded-xl border border-border bg-card p-2 shadow-sm focus-within:border-primary/30 focus-within:shadow-md transition-all">
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={e => { setInputValue(e.target.value); handleInput(); }}
            onKeyDown={handleKeyDown}
            placeholder="Describe what you want to create..."
            className="flex-1 bg-transparent px-2 py-2.5 text-sm outline-none placeholder:text-muted-foreground/40 resize-none overflow-hidden"
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim()}
            className="shrink-0 size-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <Send className="size-4" />
          </button>
        </div>

        {/* ── Feature Pills (no "All") ── */}
        <div className="flex items-center gap-2">
          {featureOptions.map((opt) => {
            const isActive = activeFeature === opt.type;
            return (
              <button
                key={opt.type}
                onClick={() => setActiveFeature(opt.type)}
                className={`inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-xs font-medium border transition-all ${
                  isActive
                    ? `${opt.bg} ${opt.color} border-current shadow-sm`
                    : 'bg-card text-muted-foreground/60 border-border/60 hover:bg-accent/50 hover:text-foreground hover:border-border'
                }`}
              >
                <opt.icon className="size-3.5" />
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* ── Suggestion Prompts ── */}
        <div className="w-full grid grid-cols-1 gap-2">
          {filteredSuggestions.slice(0, 4).map((s, i) => (
            <button
              key={i}
              onClick={() => handleSuggestionClick(s.label)}
              className="group flex items-start gap-3 rounded-xl border border-border/40 bg-card/20 p-3.5 text-left hover:bg-accent/30 hover:border-border/70 transition-all"
            >
              <div className={`shrink-0 mt-0.5 size-8 rounded-lg flex items-center justify-center ${
                s.type === 'note' ? 'bg-amber-500/10 text-amber-500' :
                s.type === 'erd' ? 'bg-blue-500/10 text-blue-500' :
                'bg-emerald-500/10 text-emerald-500'
              }`}>
                <s.icon className="size-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{s.label}</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">{s.desc}</p>
              </div>
              <ArrowRight className="size-4 text-muted-foreground/20 group-hover:text-muted-foreground/50 group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
            </button>
          ))}
        </div>
      </div>

      {/* ── Footer ── */}
      <p className="text-center text-[10px] text-muted-foreground/20 font-medium mt-6 pb-4">
        Preview Dashboard • Not yet functional
      </p>

      {/* ── Spacer bottom ── */}
      <div className="flex-1 min-h-[40px]" />
    </div>
  );
}
