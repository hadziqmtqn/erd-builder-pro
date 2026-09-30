import * as React from "react"

import { cn } from "@/lib/utils"

const Bubble = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="bubble"
      className={cn("w-fit max-w-full rounded-2xl px-4 py-2.5 text-sm", className)}
      {...props}
    />
  ),
)
Bubble.displayName = "Bubble"

const BubbleContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="bubble-content"
      className={cn("whitespace-pre-wrap break-words leading-relaxed", className)}
      {...props}
    />
  ),
)
BubbleContent.displayName = "BubbleContent"

export { Bubble, BubbleContent }
