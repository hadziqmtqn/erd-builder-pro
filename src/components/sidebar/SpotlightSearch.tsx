import { useEffect, useRef, useState } from "react"
import {
  ArrowUpRight,
  Database,
  DatabaseZap,
  FileText,
  FolderClosed,
  Loader2,
  Network,
  PenTool,
  Search,
} from "lucide-react"

import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

function getSearchShortcutLabel(): string {
  if (typeof navigator === "undefined") return "Ctrl+K"
  const platform = navigator.platform || navigator.userAgent
  return /Mac|iPhone|iPad/i.test(platform) ? "⌘K" : "Ctrl+K"
}

interface SpotlightSearchProps {
  isLoading: boolean
  isOnline: boolean
  onQueryChange: (query: string) => void
  onResultSelect: (result: any) => void
  query: string
  results: any[]
  showDbClient: boolean
}

export function SpotlightSearch({
  isLoading,
  isOnline,
  onQueryChange,
  onResultSelect,
  query,
  results,
  showDbClient,
}: SpotlightSearchProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [filter, setFilter] = useState("all")
  const inputRef = useRef<HTMLInputElement>(null)
  const shortcutLabel = getSearchShortcutLabel()
  const filters = [
    { value: "all", label: "All" },
    { value: "workspace", label: "Projects" },
    { value: "erd", label: "ERD Builder" },
    ...(showDbClient ? [{ value: "db-client", label: "DB Client" }] : []),
    { value: "notes", label: "Notes" },
    { value: "flowchart", label: "Flowcharts" },
    { value: "drawings", label: "Drawings" },
  ]
  const visibleResults = filter === "all" ? results : results.filter((result) => result.type === filter)

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setIsOpen(true)
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }

    window.addEventListener("keydown", handleShortcut)
    return () => window.removeEventListener("keydown", handleShortcut)
  }, [])

  useEffect(() => {
    if (!isOpen) return

    window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)
  }, [isOpen])

  return (
    <>
      <Button
        type="button"
        onClick={() => setIsOpen(true)}
        disabled={!isOnline}
        aria-label={`Search files (${shortcutLabel})`}
        title={`Search files (${shortcutLabel})`}
        variant="ghost"
        size="icon"
        className="size-8 shrink-0"
      >
        <Search className="size-4" aria-hidden="true" />
      </Button>

      <Dialog open={isOpen} onOpenChange={(open) => {
        setIsOpen(open)
        if (!open) {
          setFilter("all")
          onQueryChange("")
        }
      }}>
        <DialogContent
          size="2xl"
          showCloseButton={false}
          className="translate-y-0! max-h-[76vh] sm:max-w-2xl"
          style={{ top: "12vh" }}
        >
          <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
            <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search files and projects"
              aria-label="Spotlight file search"
              className="min-w-0 flex-1"
            />
            <kbd className="rounded-lg border border-border/60 bg-muted/50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground">ESC</kbd>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto border-b border-border/60 px-4 py-2.5 text-sm">
            <span className="text-muted-foreground">Filter:</span>
            <div className="flex min-w-max items-center gap-1">
              {filters.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilter(option.value)}
                  className={`min-h-10 rounded-md px-2.5 py-1 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${filter === option.value ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          {(isLoading || query.trim().length >= 2) && (
            <div className="max-h-[min(26rem,60vh)] overflow-y-auto p-2">
              {isLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Searching...
                </div>
              ) : visibleResults.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No results found.</p>
              ) : (
                visibleResults.map((result) => (
                  <button
                    key={`${result.type}-${result.uid ?? result.id}`}
                    type="button"
                    onClick={() => {
                      onResultSelect(result)
                      setIsOpen(false)
                    }}
                    className="group flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                      {result.type === "workspace" ? <FolderClosed className="size-4 text-muted-foreground" />
                        : result.type === "erd" ? <Database className="size-4 text-muted-foreground" />
                          : result.type === "db-client" ? <DatabaseZap className="size-4 text-muted-foreground" />
                            : result.type === "notes" ? <FileText className="size-4 text-muted-foreground" />
                              : result.type === "flowchart" ? <Network className="size-4 text-muted-foreground" />
                                : <PenTool className="size-4 text-muted-foreground" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{result.name || "(Untitled)"}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {result.type === "workspace" ? "Project" : result.type === "erd" ? "ERD Builder" : result.type === "db-client" ? "DB Client" : result.type === "flowchart" ? "Flowchart" : result.type === "notes" ? "Note" : "Drawing"}
                        {result.workspace?.name && ` · ${result.workspace.name}`}
                      </p>
                    </div>
                    <ArrowUpRight className="size-4 shrink-0 text-muted-foreground/40 group-hover:text-primary" aria-hidden="true" />
                  </button>
                ))
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
