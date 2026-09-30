"use client"

import * as React from "react"
import { ArrowDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

type ScrollPosition = "start" | "end"

type MessageScrollerContextValue = {
  viewport: HTMLDivElement | null
  defaultScrollPosition: ScrollPosition
  registerViewport: (viewport: HTMLDivElement | null) => void
  scrollToEnd: () => void
  canScrollEnd: boolean
  shouldFollowRef: React.MutableRefObject<boolean>
}

const MessageScrollerContext = React.createContext<MessageScrollerContextValue | null>(null)

function useMessageScrollerContext() {
  const context = React.useContext(MessageScrollerContext)
  if (!context) throw new Error("MessageScroller components must be inside MessageScrollerProvider")
  return context
}

function MessageScrollerProvider({
  children,
  defaultScrollPosition = "end",
}: React.PropsWithChildren<{ defaultScrollPosition?: ScrollPosition }>) {
  const [viewport, setViewport] = React.useState<HTMLDivElement | null>(null)
  const [canScrollEnd, setCanScrollEnd] = React.useState(false)
  const shouldFollowRef = React.useRef(true)

  const updateScrollState = React.useCallback(() => {
    if (!viewport) return
    const canScroll = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight > 8
    shouldFollowRef.current = !canScroll
    setCanScrollEnd(canScroll)
  }, [viewport])

  const registerViewport = React.useCallback((nextViewport: HTMLDivElement | null) => {
    setViewport((current) => current === nextViewport ? current : nextViewport)
  }, [])

  const scrollToEnd = React.useCallback(() => {
    if (!viewport) return
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" })
  }, [viewport])

  React.useEffect(() => {
    if (!viewport) return
    updateScrollState()
    viewport.addEventListener("scroll", updateScrollState, { passive: true })
    return () => viewport.removeEventListener("scroll", updateScrollState)
  }, [updateScrollState, viewport])

  return (
    <MessageScrollerContext.Provider
      value={{ defaultScrollPosition, viewport, registerViewport, scrollToEnd, canScrollEnd, shouldFollowRef }}
    >
      {children}
    </MessageScrollerContext.Provider>
  )
}

function MessageScroller({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="message-scroller"
      className={cn("group/message-scroller relative flex size-full min-h-0 flex-col overflow-hidden", className)}
      {...props}
    />
  )
}

function MessageScrollerViewport({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const rootRef = React.useRef<HTMLDivElement>(null)
  const { registerViewport } = useMessageScrollerContext()

  React.useEffect(() => {
    const viewport = rootRef.current?.querySelector<HTMLDivElement>('[data-slot="scroll-area-viewport"]') ?? null
    registerViewport(viewport)
    return () => registerViewport(null)
  }, [registerViewport])

  return (
    <ScrollArea
      ref={rootRef}
      className={cn("min-h-0 min-w-0 flex-1 overscroll-contain", className)}
      {...props}
    >
      {children}
    </ScrollArea>
  )
}

function MessageScrollerContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { defaultScrollPosition, viewport, shouldFollowRef } = useMessageScrollerContext()
  const initialScrollApplied = React.useRef(false)

  React.useEffect(() => {
    if (!viewport || viewport.scrollHeight === 0) return
    if (!initialScrollApplied.current || shouldFollowRef.current) {
      viewport.scrollTop = defaultScrollPosition === "start" ? 0 : viewport.scrollHeight
      initialScrollApplied.current = true
    }
  }, [children, defaultScrollPosition, viewport])

  return (
    <div
      data-slot="message-scroller-content"
      role="log"
      aria-relevant="additions"
      className={cn("flex h-max min-h-full flex-col gap-3", className)}
      {...props}
    >
      {children}
    </div>
  )
}

function MessageScrollerItem({
  className,
  messageId,
  scrollAnchor = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { messageId?: string; scrollAnchor?: boolean }) {
  return (
    <div
      data-slot="message-scroller-item"
      data-message-id={messageId}
      data-scroll-anchor={scrollAnchor ? "true" : "false"}
      className={cn("min-w-0 shrink-0", className)}
      {...props}
    />
  )
}

function MessageScrollerButton({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { canScrollEnd, scrollToEnd } = useMessageScrollerContext()

  return (
    <Button
      type="button"
      variant="secondary"
      size="icon-sm"
      aria-label="Scroll to latest message"
      data-slot="message-scroller-button"
      data-active={canScrollEnd ? "true" : "false"}
      tabIndex={canScrollEnd ? 0 : -1}
      className={cn(
        "absolute bottom-3 left-1/2 z-10 -translate-x-1/2 shadow-sm transition-[opacity,transform]",
        canScrollEnd ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0",
        className,
      )}
      onClick={scrollToEnd}
      {...props}
    >
      {children ?? <ArrowDown aria-hidden="true" />}
    </Button>
  )
}

export {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
}
