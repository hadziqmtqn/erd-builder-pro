import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Database, FileText, Network, PenTool } from 'lucide-react';

export interface FileMentionOption {
  name: string;
  type: 'note' | 'diagram' | 'flowchart' | 'drawing';
  uid: string;
  href: string;
  workspaceName?: string | null;
}

interface FileMentionMenuProps {
  options: FileMentionOption[];
  selectedIndex: number;
  coords: { top: number; left: number; bottom: number };
  onSelect: (option: FileMentionOption) => void;
  onHover: (index: number) => void;
}

const icons = {
  note: FileText,
  diagram: Database,
  flowchart: Network,
  drawing: PenTool,
};

export function FileMentionMenu({ options, selectedIndex, coords, onSelect, onHover }: FileMentionMenuProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  useEffect(() => {
    setIsFlipped(window.innerHeight - coords.bottom < 280 && coords.top > 280);
  }, [coords]);

  if (!options.length) return null;

  return createPortal(
    <div
      data-file-mention-menu
      className="fixed z-9999 w-72 max-h-64 overflow-y-auto rounded-lg border border-border bg-popover/95 p-1 shadow-2xl backdrop-blur-xl"
      style={{
        top: isFlipped ? coords.top - 8 : coords.bottom + 8,
        left: coords.left,
        transform: isFlipped ? 'translateY(-100%)' : undefined,
      }}
    >
      {options.map((option, index) => {
        const Icon = icons[option.type];
        return (
          <button
            key={`${option.type}-${option.uid}`}
            type="button"
            data-index={index}
            onPointerDown={(event) => event.preventDefault()}
            onMouseEnter={() => onHover(index)}
            onClick={() => onSelect(option)}
            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm ${
              index === selectedIndex ? 'bg-accent text-accent-foreground' : 'text-foreground/80 hover:bg-accent/60'
            }`}
          >
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate">
              <span className="block truncate">{option.name}</span>
              {option.workspaceName && <span className="block truncate text-[11px] text-muted-foreground">{option.workspaceName}</span>}
            </span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
