import { useState, useRef } from 'react';
import {
  Sparkles,
  Database,
  Info,
  Zap,
  FileText,
  AlignLeft,
  Code,
  Check,
  File,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AIAction, getActionsForView, ViewType } from './AIActions';

// Map action IDs to lucide icons
function getActionIcon(actionId: string) {
  if (actionId.includes('sql') || actionId.includes('seed')) return <Database className="size-3.5" />;
  if (actionId.includes('index')) return <Zap className="size-3.5" />;
  if (actionId.includes('explain')) return <Info className="size-3.5" />;
  if (actionId.includes('docs') || actionId.includes('grammar')) return <FileText className="size-3.5" />;
  if (actionId.includes('summarize')) return <AlignLeft className="size-3.5" />;
  if (actionId.includes('pseudo')) return <Code className="size-3.5" />;
  return <File className="size-3.5" />;
}

interface AIActionButtonProps {
  viewType: ViewType;
  onAction: (action: AIAction, context: Record<string, any>) => void;
  /** Current view context data for prompt building */
  context: Record<string, any>;
  /** Optional: show as icon-only (for tight toolbars) */
  iconOnly?: boolean;
}

export function AIActionButton({ viewType, onAction, context, iconOnly = false }: AIActionButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const actions = getActionsForView(viewType);
  const isComingSoon = viewType !== 'notes';

  const handleSelect = (action: AIAction) => {
    if (isComingSoon) return;
    onAction(action, context);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      <Button
        variant="outline"
        disabled={isComingSoon}
        size="sm"
        className={`h-9 px-3 font-bold text-muted-foreground border-border/50 hover:bg-muted/50 ${isComingSoon ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} relative ${iconOnly ? 'px-2.5' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={(e) => {
          // Close if leaving the button area (handled by timeout)
          setTimeout(() => {
            if (menuRef.current && !menuRef.current.matches(':hover')) {
              setIsOpen(false);
            }
          }, 200);
        }}
        title={isComingSoon ? "Coming Soon..." : "AI Actions"}
      >
        <Sparkles className={`size-4 ${iconOnly ? '' : 'sm:mr-1.5'}`} />
        <span className={`hidden sm:inline text-xs ${iconOnly ? 'hidden' : ''}`}>AI</span>
      </Button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          className="absolute top-full right-0 mt-1.5 min-w-[200px] bg-background/95 backdrop-blur-xl border border-border/50 rounded-xl shadow-2xl shadow-black/10 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150"
          onMouseEnter={() => setIsOpen(true)}
          onMouseLeave={() => setIsOpen(false)}
        >
          {/* Header */}
          <div className="px-3 py-2 border-b border-border/20">
            <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">
              AI Actions
            </p>
          </div>

          {/* Action list */}
          <div className="py-1">
            {actions.map((action) => (
              <button
                key={action.id}
                onClick={() => handleSelect(action)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left hover:bg-muted/50 transition-colors"
              >
                <div className="shrink-0 size-6 rounded-md bg-muted/30 border border-border/30 flex items-center justify-center text-muted-foreground">
                  {getActionIcon(action.id)}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-foreground/80">{action.label}</p>
                  <p className="text-[10px] text-muted-foreground/50 truncate">{action.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
