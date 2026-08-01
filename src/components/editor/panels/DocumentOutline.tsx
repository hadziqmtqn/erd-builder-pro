import React, { useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Info, ListTree } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface HeadingInfo {
  text: string;
  level: number;
  pos: number;
}

interface DocumentOutlineProps {
  headings: HeadingInfo[];
  scrollToHeading: (pos: number) => void;
}

function buildNumberedHeadings(headings: HeadingInfo[]): { heading: HeadingInfo; number: string }[] {
  const counters: number[] = [0, 0, 0, 0, 0, 0];
  return headings.map(h => {
    const idx = h.level - 1;
    counters[idx]++;
    for (let i = idx + 1; i < counters.length; i++) counters[i] = 0;
    const number = counters.slice(0, idx + 1).filter(Boolean).join('.');
    return { heading: h, number };
  });
}

export function DocumentOutline({ headings, scrollToHeading }: DocumentOutlineProps) {
  const numbered = useMemo(() => buildNumberedHeadings(headings), [headings]);
  const [calculationHelpOpen, setCalculationHelpOpen] = React.useState(false);

  return (
    <>
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
                className="w-75 bg-popover/95 backdrop-blur-xl border-border rounded-lg p-5 shadow-2xl"
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
                            "flex w-full min-w-0 items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-foreground",
                            heading.level === 1 ? "text-primary font-bold bg-primary/5" :
                              heading.level === 2 ? "pl-5 text-foreground/70" :
                                heading.level === 3 ? "pl-7 text-foreground/60" :
                                  heading.level === 4 ? "pl-9 text-foreground/50" :
                                    "pl-11 text-foreground/40"
                          )}
                        >
                          <span className="shrink-0 whitespace-nowrap tabular-nums text-muted-foreground/50">{number}.</span>
                          <span className="min-w-0 flex-1 truncate">{heading.text}</span>
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
                  onClick={() => setCalculationHelpOpen(true)}
                  className="h-10 w-10 rounded-full shadow-lg border border-border/50 bg-background/80 backdrop-blur-sm hover:bg-accent transition-all duration-300"
                >
                  <Info className="w-5 h-5 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Calculation Guide</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <Dialog open={calculationHelpOpen} onOpenChange={setCalculationHelpOpen}>
        <DialogContent size="2xl" className="max-h-[82vh]">
          <DialogHeader>
            <DialogTitle>Table Calculation Guide</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-5 overflow-y-auto pr-1 text-sm leading-6">
            <section className="space-y-2">
              <h3 className="font-semibold text-foreground">How it works</h3>
              <p className="text-muted-foreground">
                Type a formula command in a table cell, then leave the cell. The editor replaces the
                command with the calculated result. Hover the result cell to see the Excel-style source
                range used for that value.
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold text-foreground">Vertical formulas</h3>
              <p className="text-muted-foreground">
                Vertical formulas calculate numeric values in the same column. They are intended for
                header or footer rows.
              </p>
              <div className="grid gap-2 rounded-md border bg-muted/30 p-3">
                <code>=SUM</code>
                <code>=SUMV</code>
                <span className="text-muted-foreground">Sum values vertically, for example: SUMV(B2:B5).</span>
                <code>=AVG</code>
                <code>=AVGV</code>
                <span className="text-muted-foreground">Average values vertically, for example: AVGV(C2:C5).</span>
                <code>=MUL</code>
                <code>=PRODUCT</code>
                <code>=MULV</code>
                <code>=PRODUCTV</code>
                <span className="text-muted-foreground">Multiply values vertically, for example: PRODUCTV(D2:D5).</span>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold text-foreground">Horizontal formulas</h3>
              <p className="text-muted-foreground">
                Horizontal formulas calculate numeric values to the left of the formula cell in the same row.
              </p>
              <div className="grid gap-2 rounded-md border bg-muted/30 p-3">
                <code>=SUMH</code>
                <span className="text-muted-foreground">Sum values horizontally, for example: SUMH(B2:C2).</span>
                <code>=AVGH</code>
                <span className="text-muted-foreground">Average values horizontally, for example: AVGH(B2:D2).</span>
                <code>=MULH</code>
                <code>=PRODUCTH</code>
                <span className="text-muted-foreground">Multiply values horizontally, for example: PRODUCTH(B2:C2).</span>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold text-foreground">Examples</h3>
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 font-medium">Item</th>
                      <th className="px-3 py-2 font-medium">Qty</th>
                      <th className="px-3 py-2 font-medium">Price</th>
                      <th className="px-3 py-2 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t">
                      <td className="px-3 py-2">Hosting</td>
                      <td className="px-3 py-2">12</td>
                      <td className="px-3 py-2">90.000</td>
                      <td className="px-3 py-2"><code>=MULH</code> becomes 1.080.000</td>
                    </tr>
                    <tr className="border-t">
                      <td className="px-3 py-2">Setup</td>
                      <td className="px-3 py-2">100.000</td>
                      <td className="px-3 py-2">50.000</td>
                      <td className="px-3 py-2"><code>=SUMH</code> becomes 150.000</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-muted-foreground">
                Text cells are skipped. Indonesian number formatting such as 1.080.000 and decimal
                commas is accepted. Currency symbols are ignored when possible.
              </p>
            </section>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
