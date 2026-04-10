import * as React from "react"
import { cn } from "@/lib/utils"

const Progress = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { value?: number }
>(({ className, value, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("w-full space-y-2", className)}
    {...props}
  >
    <div className="relative h-1 w-full overflow-hidden rounded-full bg-zinc-800/50">
      <div
        className="h-full w-full flex-1 bg-indigo-500 transition-all duration-300 ease-in-out"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </div>
    <div className="flex justify-between items-center text-xs font-medium text-zinc-400">
      {children}
    </div>
  </div>
))
Progress.displayName = "Progress"

const ProgressLabel = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn("text-zinc-500", className)} {...props} />
)
ProgressLabel.displayName = "ProgressLabel"

const ProgressValue = ({ className, value, ...props }: React.HTMLAttributes<HTMLSpanElement> & { value?: number }) => (
  <span 
    className={cn("text-zinc-100 font-mono", className)} 
    {...props}
  >
    {value}%
  </span>
)
ProgressValue.displayName = "ProgressValue"

export { Progress, ProgressLabel, ProgressValue }
