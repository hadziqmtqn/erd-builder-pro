import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * A keyboard shortcut badge. System sans text keeps ⌘ ⇧ ⌥ ⌃ the same size as the letters, which a
 * monospace font does not (its fallback glyphs render larger). Write shortcuts the macOS way, modifiers
 * in ⌃⌥⇧⌘ order without spaces (⇧⌘F), and Ctrl+Shift+F elsewhere.
 */
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded border border-border/60 bg-muted/50 px-1.5 font-sans text-[10px] font-medium leading-none text-muted-foreground select-none",
        className
      )}
      {...props}
    />
  )
}

export { Kbd }
