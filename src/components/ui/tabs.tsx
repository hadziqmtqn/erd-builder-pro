"use client"

import * as React from "react"
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"

import { cn } from "@/lib/utils"

function Tabs({ ...props }: TabsPrimitive.Root.Props) {
  return <TabsPrimitive.Root data-slot="tabs" {...props} />
}

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & {
  variant?: "default" | "line"
}) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(
        "inline-flex items-center justify-center p-1 text-muted-foreground transition-all",
        variant === "default" && "h-10 rounded-lg bg-muted",
        variant === "line" && "w-full justify-start border-b border-white/5 p-0 gap-8 bg-transparent",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
        // Default variant
        "data-[variant=default]:rounded-md data-[variant=default]:px-3 data-[variant=default]:py-1.5 data-[variant=default]:data-[selected]:bg-background data-[variant=default]:data-[selected]:text-foreground data-[variant=default]:data-[selected]:shadow-sm",
        // Line variant - Exactly as per image
        "data-[variant=line]:px-0 data-[variant=line]:py-4 data-[variant=line]:text-white/50 data-[variant=line]:hover:text-white/80 data-[variant=line]:data-[selected]:text-white data-[variant=line]:data-[selected]:border-b-2 data-[variant=line]:data-[selected]:border-white data-[variant=line]:bg-transparent data-[variant=line]:-mb-[2px]",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn(
        "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
