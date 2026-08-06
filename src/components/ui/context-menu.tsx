"use client"

import * as React from "react"
import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu"
import { ChevronRightIcon } from "lucide-react"
import { cn } from "@/lib/utils"

function ContextMenu({ ...props }: ContextMenuPrimitive.Root.Props) {
  return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />
}

const ContextMenuTrigger = React.forwardRef<
  HTMLDivElement,
  ContextMenuPrimitive.Trigger.Props
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Trigger
    ref={ref}
    data-slot="context-menu-trigger"
    className={className}
    {...props}
  />
))
ContextMenuTrigger.displayName = "ContextMenuTrigger"

function ContextMenuContent({
  sideOffset = 4,
  className,
  ...props
}: ContextMenuPrimitive.Popup.Props &
  Pick<ContextMenuPrimitive.Positioner.Props, "sideOffset">) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Positioner className="isolate z-50" sideOffset={sideOffset}>
        <ContextMenuPrimitive.Popup
          data-slot="context-menu-content"
          className={cn(
            "z-50 min-w-32 max-w-(--available-width) max-h-(--available-height) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        />
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  )
}

function ContextMenuItem({
  className,
  variant = "default",
  ...props
}: ContextMenuPrimitive.Item.Props & {
  variant?: "default" | "destructive"
}) {
  return (
    <ContextMenuPrimitive.Item
      data-slot="context-menu-item"
      data-variant={variant}
      className={cn(
        "group/context-menu-item relative flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  )
}

function ContextMenuSub({ ...props }: ContextMenuPrimitive.SubmenuRoot.Props) {
  return <ContextMenuPrimitive.SubmenuRoot data-slot="context-menu-sub" {...props} />
}

function ContextMenuSubTrigger({
  className,
  children,
  ...props
}: ContextMenuPrimitive.SubmenuTrigger.Props) {
  return (
    <ContextMenuPrimitive.SubmenuTrigger
      data-slot="context-menu-sub-trigger"
      className={cn(
        "flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none focus:bg-accent focus:text-accent-foreground data-popup-open:bg-accent data-popup-open:text-accent-foreground",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto size-4" />
    </ContextMenuPrimitive.SubmenuTrigger>
  )
}

function ContextMenuSubContent({
  className,
  sideOffset = 4,
  ...props
}: ContextMenuPrimitive.Popup.Props &
  Pick<ContextMenuPrimitive.Positioner.Props, "sideOffset">) {
  return (
    <ContextMenuContent
      sideOffset={sideOffset}
      className={cn("min-w-40", className)}
      {...props}
    />
  )
}

function ContextMenuSeparator({ className, ...props }: ContextMenuPrimitive.Separator.Props) {
  return (
    <ContextMenuPrimitive.Separator
      data-slot="context-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuSeparator,
}
