import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, ChevronUp } from 'lucide-react';
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const DROPDOWN_MAX_H = 192; // max-h-48
const GAP = 4;

export interface SearchableSelectProps<T> {
  value: string;
  onChange: (value: string) => void;
  items: T[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
  disabled?: boolean;
  getItemValue: (item: T) => string;
  getItemLabel: (item: T) => string;
  filterItem: (item: T, query: string) => boolean;
  onOpen?: () => void;
}

export function SearchableSelect<T>({
  value,
  onChange,
  items,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No results found',
  className,
  disabled = false,
  getItemValue,
  getItemLabel,
  filterItem,
  onOpen,
}: SearchableSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const [above, setAbove] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const calcPos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - GAP;
    const spaceAbove = rect.top - GAP;

    if (spaceBelow >= DROPDOWN_MAX_H || spaceBelow >= spaceAbove) {
      setPos({ top: rect.bottom + GAP, left: rect.left, width: rect.width });
      setAbove(false);
    } else {
      setPos({ top: rect.top - GAP, left: rect.left, width: rect.width });
      setAbove(true);
    }
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideTrigger = containerRef.current?.contains(target);
      const insideDropdown = document.getElementById('searchable-select-portal')?.contains(target);
      if (!insideTrigger && !insideDropdown) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Update position on scroll/resize while open
  useEffect(() => {
    if (!open) return;
    calcPos();
    window.addEventListener('scroll', calcPos, true);
    window.addEventListener('resize', calcPos);
    return () => {
      window.removeEventListener('scroll', calcPos, true);
      window.removeEventListener('resize', calcPos);
    };
  }, [open, calcPos]);

  // Auto-focus + reset on close
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setSearch('');
    }
  }, [open]);

  // Scroll selected item into view on open
  useEffect(() => {
    if (open && value) {
      requestAnimationFrame(() => {
        listRef.current?.querySelector<HTMLElement>('[data-selected]')?.scrollIntoView({ block: 'nearest' });
      });
    }
  }, [open, value]);

  const filtered = search
    ? items.filter(item => filterItem(item, search))
    : items;

  const selectedLabel = value
    ? items.find(item => getItemValue(item) === value)
    : null;

  const select = (item: T) => {
    onChange(getItemValue(item));
    setOpen(false);
  };

  const dropdown = open && (
    <div
      id="searchable-select-portal"
      style={{
        position: 'fixed',
        top: above ? undefined : pos.top,
        bottom: above ? window.innerHeight - pos.top : undefined,
        left: pos.left,
        width: pos.width,
        maxHeight: DROPDOWN_MAX_H,
        zIndex: 1100,
      }}
      className="rounded-lg border bg-popover shadow-md overflow-hidden flex flex-col"
    >
      <div className="flex items-center border-b border-border/50 px-2 shrink-0">
        <Search className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
        <Input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-8 border-0 bg-transparent text-[11px] focus-visible:ring-0 focus-visible:ring-offset-0 px-2"
        />
      </div>
      <div ref={listRef} className="overflow-y-auto custom-scrollbar py-1">
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-[11px] text-muted-foreground text-center">
            {emptyMessage}
          </div>
        ) : (
          filtered.map(item => {
            const isSelected = getItemValue(item) === value;
            return (
              <button
                key={getItemValue(item)}
                type="button"
                onClick={() => select(item)}
                data-selected={isSelected ? '' : undefined}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-[11px] hover:bg-accent transition-colors",
                  isSelected && "bg-accent font-semibold",
                )}
              >
                {getItemLabel(item)}
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(v => {
          if (!v) {
            calcPos();
            onOpen?.();
          }
          return !v;
        })}
        disabled={disabled}
        className={cn(
          "flex h-8 w-full items-center justify-between rounded-md border border-border/50 bg-background/50 px-2 text-[11px] font-medium whitespace-nowrap transition-all outline-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
          "focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20",
          "hover:border-border",
          !value && "text-muted-foreground/50",
          className,
        )}
      >
        <span className={cn('min-w-0 flex-1 truncate text-left', !value && 'text-muted-foreground/50')}>
          {selectedLabel ? getItemLabel(selectedLabel) : placeholder}
        </span>
        {open && above
          ? <ChevronUp className="size-3 text-muted-foreground/60" />
          : <ChevronDown className="size-3 text-muted-foreground/60" />
        }
      </button>
      {createPortal(dropdown, document.body)}
    </div>
  );
}
