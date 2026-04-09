import React, { useState, useMemo } from 'react';
import { useReactFlow, Node } from '@xyflow/react';
import { Search, MapPin, ChevronDown } from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from '@/lib/utils';

interface JumpToNodeProps {
  nodes: Node[];
  className?: string;
}

export function JumpToNode({ nodes, className }: JumpToNodeProps) {
  const { setCenter } = useReactFlow();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Focus input when dropdown opens
  React.useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Handle escape or other keys if needed
  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    // Prevent dropdown from intercepting keys (especially space and arrows)
    e.stopPropagation();
    if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const filteredNodes = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return nodes;
    
    return nodes.filter(node => {
      const data = node.data as any;
      const name = (data.name || data.label || '').toLowerCase();
      // Simple fuzzy match: starts with or includes
      return name.includes(s);
    });
  }, [nodes, search]);

  const handleJump = (node: Node) => {
    setOpen(false);
    setSearch('');

    // Small delay to ensure the dropdown menu closure doesn't interfere
    // with the React Flow viewport manipulation.
    const x = node.position.x + (node.measured?.width ?? 200) / 2;
    const y = node.position.y + (node.measured?.height ?? 100) / 2;

    setTimeout(() => {
      setCenter(x, y, { zoom: 1.2 });
    }, 50);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger render={
        <Button 
          variant="outline" 
          size="sm" 
          className={cn(
            "h-9 px-3 text-xs font-bold border-border/50 bg-muted/20 hover:bg-muted text-muted-foreground transition-all",
            className
          )}
        >
          <MapPin className="w-3.5 h-3.5 mr-2" />
          <span className="hidden sm:inline">Jump to Table</span>
          <span className="sm:hidden">Jump</span>
          <ChevronDown className="w-3 h-3 ml-2 opacity-50" />
        </Button>
      } />
      <DropdownMenuContent align="start" className="w-[280px] p-0 shadow-2xl border-border/50 bg-background/95 backdrop-blur-xl">
        <div className="p-3 pb-2" onPointerDown={(e) => e.stopPropagation()}>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input 
              ref={inputRef}
              placeholder="Search components..." 
              className="h-8 pl-8 text-xs bg-muted/50 border-none focus-visible:ring-1 focus-visible:ring-primary/50"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleInputKeyDown}
              autoComplete="off"
            />
          </div>
        </div>
        <DropdownMenuSeparator className="bg-border/50" />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-3 pt-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
            Showing {filteredNodes.length} of {nodes.length}
          </DropdownMenuLabel>
          <ScrollArea className="h-[250px] px-1 pb-1">
            {filteredNodes.length === 0 ? (
              <div className="px-3 py-6 text-center text-[11px] text-muted-foreground italic">
                No matching items found
              </div>
            ) : (
              filteredNodes.map((node) => {
                const name = (node.data as any).name || (node.data as any).label || 'Unnamed component';
                return (
                  <DropdownMenuItem 
                    key={node.id} 
                    onSelect={() => handleJump(node)}
                    className="flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors focus:bg-accent focus:text-accent-foreground rounded-lg mx-1"
                  >
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: (node.data as any).color || '#8b5cf6' }} />
                    <span className="text-[13px] font-medium truncate tracking-tight">{name}</span>
                  </DropdownMenuItem>
                );
              })
            )}
          </ScrollArea>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
