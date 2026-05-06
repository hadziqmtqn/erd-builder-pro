import * as React from "react"
import { useRef, useState, useEffect } from "react"
import { Plus, MoreHorizontal, Database, StickyNote, PenTool, Network } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { FileMenuItem } from "../components/FileMenuItem"
import { Diagram, Note, Drawing, Flowchart } from "../../../types"

interface FileGroupProps {
  sidebarView: 'erd' | 'notes' | 'drawings' | 'flowchart' | 'changelog'
  view: string
  isOnline: boolean
  isLoading: boolean
  hasMore: boolean
  searchQuery: string
  files: (Diagram | Note | Drawing | Flowchart)[]
  activeFileId: number | string | null
  onFileSelect: (id: number | string) => void
  onAddClick: () => void
  onLoadMore: () => void
  setEditingFile: (file: any) => void
  setSelectedProjectId: (id: string) => void
  setIsEditFileDialogOpen: (open: boolean) => void
  setDeletingFile: (file: any) => void
  setIsDeleteConfirmOpen: (open: boolean) => void
}

function getFileIdentifier(file: any): number | string {
  return file.uid ?? file.id;
}

export function FileGroup({
  sidebarView,
  view,
  isOnline,
  isLoading,
  hasMore,
  searchQuery,
  files,
  activeFileId,
  onFileSelect,
  onAddClick,
  onLoadMore,
  setEditingFile,
  setSelectedProjectId,
  setIsEditFileDialogOpen,
  setDeletingFile,
  setIsDeleteConfirmOpen
}: FileGroupProps) {
  const [visibleCount, setVisibleCount] = useState(25)
  const [showAll, setShowAll] = useState(false)

  const loadMoreRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (showAll || files.length <= visibleCount) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisibleCount(prev => Math.min(prev + 25, files.length))
      }
    }, { rootMargin: '100px' })
    if (loadMoreRef.current) observer.observe(loadMoreRef.current)
    return () => observer.disconnect()
  }, [showAll, visibleCount, files.length])

  const getIcon = () => {
    switch (sidebarView) {
      case 'erd': return Database
      case 'notes': return StickyNote
      case 'drawings': return PenTool
      case 'flowchart': return Network
      default: return Database
    }
  }

  const getLabel = () => {
    switch (sidebarView) {
      case 'erd': return 'Diagrams'
      case 'notes': return 'Notes'
      case 'flowchart': return 'Flowcharts'
      case 'drawings': return 'Drawings'
      default: return 'Files'
    }
  }

  const shared = files.filter(f => f.is_public)
  const privateItems = files.filter(f => !f.is_public)
  const hasTruncated = files.length > visibleCount
  const displayedShared = showAll ? shared : shared.slice(0, Math.min(shared.length, visibleCount))
  const remainingVisible = Math.max(0, (showAll ? Infinity : visibleCount) - displayedShared.length)
  const displayedPrivate = showAll ? privateItems : privateItems.slice(0, remainingVisible)

  const Icon = getIcon()

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden pt-0">
      <SidebarGroupLabel>{getLabel()}</SidebarGroupLabel>
      {!isOnline ? null : (
        <SidebarGroupAction title={`Add ${sidebarView}`} onClick={onAddClick} className="cursor-pointer">
          <Plus />
        </SidebarGroupAction>
      )}
      <SidebarMenu>
        {isLoading && (
          <div className="space-y-2 px-2 py-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && (
          <>
            {/* Shared Section */}
            <div className="px-2 pt-4 pb-1 text-[10px] uppercase font-semibold text-muted-foreground/70 tracking-wider">Shared</div>
            {displayedShared.length > 0 ? displayedShared.map(file => (
              <FileMenuItem 
                key={getFileIdentifier(file)}
                item={file}
                type={sidebarView as any}
                icon={Icon}
                isActive={String(activeFileId) === String(getFileIdentifier(file)) && view === sidebarView}
                isOnline={isOnline}
                onSelect={onFileSelect}
                setEditingFile={setEditingFile}
                setSelectedProjectId={setSelectedProjectId}
                setIsEditFileDialogOpen={setIsEditFileDialogOpen}
                setDeletingFile={setDeletingFile}
                setIsDeleteConfirmOpen={setIsDeleteConfirmOpen}
              />
            )) : (
              shared.length === 0 && (
                <div className="px-5 py-2 text-[11px] text-muted-foreground/50 italic">No shared items found</div>
              )
            )}

            {/* Private Section */}
            {displayedPrivate.length > 0 && (
              <>
                <div className="px-2 pt-4 pb-1 text-[10px] uppercase font-semibold text-muted-foreground/70 tracking-wider">Private</div>
                {displayedPrivate.map(file => (
                <FileMenuItem 
                  key={getFileIdentifier(file)}
                  item={file}
                  type={sidebarView as any}
                  icon={Icon}
                  isActive={String(activeFileId) === String(getFileIdentifier(file)) && view === sidebarView}
                  isOnline={isOnline}
                  onSelect={onFileSelect}
                    setEditingFile={setEditingFile}
                    setSelectedProjectId={setSelectedProjectId}
                    setIsEditFileDialogOpen={setIsEditFileDialogOpen}
                    setDeletingFile={setDeletingFile}
                    setIsDeleteConfirmOpen={setIsDeleteConfirmOpen}
                  />
                ))}
              </>
            )}
          </>
        )}

        {hasTruncated && !showAll && (
          <SidebarMenuItem>
            <div ref={loadMoreRef} className="flex items-center justify-center py-2">
              <span className="text-[10px] text-muted-foreground/50 animate-pulse">Loading more...</span>
            </div>
          </SidebarMenuItem>
        )}
        {hasTruncated && !showAll && (
          <SidebarMenuItem>
            <SidebarMenuButton
              className="text-[11px] text-muted-foreground/60 hover:text-foreground justify-center cursor-pointer"
              onClick={() => setShowAll(true)}
            >
              Show all {files.length} items
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}
        {hasTruncated && showAll && (
          <SidebarMenuItem>
            <SidebarMenuButton
              className="text-[11px] text-muted-foreground/60 hover:text-foreground justify-center cursor-pointer"
              onClick={() => { setVisibleCount(25); setShowAll(false) }}
            >
              Show less
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}

        {hasMore && (
          <SidebarMenuItem>
            <SidebarMenuButton 
              className="text-muted-foreground hover:text-foreground cursor-pointer"
              onClick={onLoadMore}
            >
              <MoreHorizontal className="size-4" />
              <span>More</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}

        {searchQuery && files.length === 0 && (
          <div className="px-4 py-2 text-xs text-muted-foreground italic">No results match "{searchQuery}"</div>
        )}
      </SidebarMenu>
    </SidebarGroup>
  )
}
