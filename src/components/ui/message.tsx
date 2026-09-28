import * as React from "react"

import { cn } from "@/lib/utils"

type MessageAlign = "start" | "end"

function Message({
  align = "start",
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { align?: MessageAlign }) {
  return (
    <div
      data-slot="message"
      data-align={align}
      className={cn(
        "flex w-full items-end gap-2",
        align === "end" ? "justify-end" : "justify-start",
        className,
      )}
      {...props}
    />
  )
}

function MessageGroup({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="message-group"
      className={cn("flex flex-col gap-1", className)}
      {...props}
    />
  )
}

function MessageAvatar({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="message-avatar"
      className={cn("flex size-8 shrink-0 items-end", className)}
      {...props}
    />
  )
}

function MessageContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="message-content"
      className={cn("flex min-w-0 max-w-[calc(100%-2.5rem)] flex-col", className)}
      {...props}
    />
  )
}

export { Message, MessageGroup, MessageAvatar, MessageContent }
