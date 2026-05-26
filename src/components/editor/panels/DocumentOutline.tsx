import React, { useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ListTree, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { copyMarkdownToClipboard } from '../../../lib/markdownUtils';
import { Editor } from '@tiptap/react';

export interface HeadingInfo {
  text: string;
  level: number;
  pos: number;
}

interface DocumentOutlineProps {
  headings: HeadingInfo[];
  scrollToHeading: (pos: number) => void;
  editor: Editor | null;
}

function buildNumberedHeadings(headings: HeadingInfo[]): { heading: HeadingInfo; number: string }[] {
  const counters: number[] = [0, 0, 0, 0, 0, 0];
  return headings.map(h => {
    const idx = h.level - 1;
    counters[idx]++;
    for (let i = idx + 1; i < counters.length; i++) counters[i] = 0;
    const number = counters.slice(0, idx + 1).join('.');
    return { heading: h, number };
  });
}

export function DocumentOutline({ headings, scrollToHeading, editor }: DocumentOutlineProps) {
  const numbered = useMemo(() => buildNumberedHeadings(headings), [headings]);

  return (
    <div className="absolute -right-14 top-0 h-full hidden md:block z-40">
      <div className="sticky top-1/2 -translate-y-1/2">
        <TooltipProvider delay={0}>
          <HoverCard openDelay={100} closeDelay={300}>
            <Tooltip>
              <TooltipTrigger render={<div className="flex items-center justify-center" />}>
                <HoverCardTrigger asChild>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-10 w-10 rounded-full shadow-lg border border-border/50 bg-background/80 backdrop-blur-sm hover:bg-accent transition-all duration-300"
                  >
                    <ListTree className="w-5 h-5 text-muted-foreground" />
                  </Button>
                </HoverCardTrigger>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Document Outline</p>
              </TooltipContent>
            </Tooltip>

            <HoverCardContent
              side="left"
              align="center"
              sideOffset={15}
              className="w-[300px] bg-popover/95 backdrop-blur-xl border-border rounded-lg p-5 shadow-2xl"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <h4 className="text-sm font-semibold tracking-tight">Navigation</h4>
                  <span className="text-[10px] text-muted-foreground uppercase font-medium">Headings</span>
                </div>

                {numbered.length > 0 ? (
                  <div className="flex flex-col gap-1 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
                    {numbered.map(({ heading, number }, i) => (
                      <button
                        key={`${heading.pos}-${i}`}
                        onClick={() => scrollToHeading(heading.pos)}
                        className={cn(
                          "text-left transition-all duration-200 py-1.5 px-3 rounded-md hover:bg-accent text-sm font-medium text-foreground/80 hover:text-foreground truncate",
                          heading.level === 1 ? "text-primary font-bold bg-primary/5" :
                            heading.level === 2 ? "pl-4 text-foreground/70" :
                              heading.level === 3 ? "pl-7 text-foreground/60 scale-95 origin-left" :
                                heading.level === 4 ? "pl-10 text-foreground/50 scale-90 origin-left" :
                                  "pl-12 text-foreground/40 scale-90 origin-left"
                        )}
                      >
                        <span className="tabular-nums text-muted-foreground/50 mr-2 shrink-0">{number}.</span>
                        <span className="truncate">{heading.text}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground/50">
                    <p className="text-xs italic">No headings found</p>
                  </div>
                )}
              </div>
            </HoverCardContent>
          </HoverCard>
        </TooltipProvider>

        <TooltipProvider delay={0}>
          <Tooltip>
            <TooltipTrigger render={<div className="flex items-center justify-center mt-3" />}>
              <Button
                variant="secondary"
                size="icon"
                onClick={() => editor && copyMarkdownToClipboard(editor.getHTML())}
                className="h-10 w-10 rounded-full shadow-lg border border-border/50 bg-background/80 backdrop-blur-sm hover:bg-accent transition-all duration-300"
              >
                <Copy className="w-5 h-5 text-muted-foreground" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Copy as Markdown</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
