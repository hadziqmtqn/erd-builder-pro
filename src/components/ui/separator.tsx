"use client"

import * as React from "react"
import { Separator as SeparatorPrimitive } from "@base-ui/react/separator"

import { cn } from "@/lib/utils"

const Separator = React.forwardRef<
  HTMLDivElement,
  SeparatorPrimitive.Props
>(({ className, orientation = "horizontal", ...props }, ref) => {
  return (
    <SeparatorPrimitive
      ref={ref}
      data-slot="separator"
      orientation={orientation}
      className={cn(
        "shrink-0 bg-border data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch",
        className
      )}
      {...props}
    />
  )
})
Separator.displayName = "Separator"

export { Separator }
