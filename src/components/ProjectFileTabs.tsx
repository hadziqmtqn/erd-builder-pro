import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Check, Database, FileText, GitBranch, PenTool, Plus } from 'lucide-react'
import { useWorkspace } from '@/providers/WorkspaceProvider'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type FeatureTab = 'notes' | 'erd' | 'flowchart' | 'drawings'

const FEATURES: { id: FeatureTab; label: string; icon: React.ElementType; route: string }[] = [
  { id: 'notes', label: 'Notes', icon: FileText, route: '/notes' },
  { id: 'erd', label: 'ERD Builder', icon: Database, route: '/diagrams' },
  { id: 'flowchart', label: 'Flowchart', icon: GitBranch, route: '/flowcharts' },
  { id: 'drawings', label: 'Drawings', icon: PenTool, route: '/drawings' },
]

const getFileName = (file: any) => file.title || file.name || 'Untitled'
const getFileUid = (file: any) => file.uid || file.id
const getCreatedTime = (file: any) => new Date(file.created_at || file.createdAt || 0).getTime()

interface Props {
  currentView: string
}

export function ProjectFileTabs({ currentView }: Props) {
  const [createOpen, setCreateOpen] = useState(false)
  const [createType, setCreateType] = useState<FeatureTab>('notes')
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const {
    activeProjectId,
    activeDiagram, activeNote, activeDrawing, activeFlowchart,
    activeDiagramId, activeNoteUid, activeDrawingId, activeFlowchartId,
    diagrams, notes, drawings, flowcharts,
    handleSidebarDiagramCreate, handleSidebarNoteCreate,
    handleSidebarDrawingCreate, handleSidebarFlowchartCreate,
  } = useWorkspace()

  useEffect(() => {
    if (!createOpen) return
    const handler = (e: MouseEvent) => {
      if (!popoverRef.current?.contains(e.target as Node)) {
        setCreateOpen(false)
        setNewName('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [createOpen])

  useEffect(() => {
    if (createOpen) setTimeout(() => inputRef.current?.focus(), 0)
  }, [createOpen, createType])

  const projectId = useMemo((): string | number | null => {
    if (activeProjectId && activeProjectId !== 'all') return activeProjectId
    const activeFile = currentView === 'notes'
      ? activeNote
      : currentView === 'erd'
        ? activeDiagram
        : currentView === 'flowchart'
          ? activeFlowchart
          : activeDrawing
    return activeFile?.project_id ?? activeFile?.projectId ?? searchParams.get('pid')
  }, [activeProjectId, activeNote, activeDiagram, activeFlowchart, activeDrawing, currentView, searchParams])

  const projectFiles = useMemo(() => {
    if (!projectId) return []
    const byProject = (file: any) => String(file.project_id ?? file.projectId) === String(projectId)
    return [
      ...notes.filter(byProject).map(file => ({ file, type: 'notes' as const })),
      ...diagrams.filter(byProject).map(file => ({ file, type: 'erd' as const })),
      ...flowcharts.filter(byProject).map(file => ({ file, type: 'flowchart' as const })),
      ...drawings.filter(byProject).map(file => ({ file, type: 'drawings' as const })),
    ].sort((a, b) => getCreatedTime(a.file) - getCreatedTime(b.file))
  }, [projectId, notes, diagrams, flowcharts, drawings])

  const activeUid = currentView === 'notes'
    ? activeNoteUid
    : currentView === 'erd'
      ? activeDiagram?.uid || activeDiagramId
      : currentView === 'flowchart'
        ? activeFlowchart?.uid || activeFlowchartId
        : activeDrawing?.uid || activeDrawingId

  const navigateTo = (type: FeatureTab, file: any) => {
    const feature = FEATURES.find(item => item.id === type)
    if (!feature) return
    navigate(`${feature.route}/${getFileUid(file)}?pid=${projectId}`)
  }

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name || creating || !projectId) return
    setCreating(true)
    try {
      const pid = String(projectId)
      if (createType === 'notes') await handleSidebarNoteCreate(name, pid)
      else if (createType === 'erd') await handleSidebarDiagramCreate(name, pid)
      else if (createType === 'flowchart') await handleSidebarFlowchartCreate(name, pid)
      else await handleSidebarDrawingCreate(name, pid)
      setCreateOpen(false)
      setNewName('')
    } finally {
      setCreating(false)
    }
  }

  if (!projectId) return null

  return (
    <div className="flex min-h-12 items-center border-b bg-background shrink-0">
      <div className="flex-1 min-w-0 overflow-x-auto scrollbar-hide">
        <div className="flex items-center justify-start gap-1 px-3 py-2">
          {projectFiles.map(({ file, type }) => {
            const feature = FEATURES.find(item => item.id === type)!
            const Icon = feature.icon
            const uid = getFileUid(file)
            const isActive = currentView === type && String(activeUid) === String(uid)
            return (
              <button
                key={`${type}-${uid}`}
                onClick={() => navigateTo(type, file)}
                className={cn(
                  "flex h-8 max-w-44 shrink-0 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
                title={`${feature.label}: ${getFileName(file)}`}
              >
                <Icon className="size-3.5" />
                <span className="truncate">{getFileName(file)}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div ref={popoverRef} className="relative shrink-0 self-stretch border-l bg-background px-2 py-2">
        <button
          onClick={() => setCreateOpen(open => !open)}
          className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
          aria-label="Create file"
          aria-expanded={createOpen}
        >
          <Plus className="size-4" />
        </button>

        {createOpen && (
          <div className="absolute right-2 top-full z-50 mt-1 w-72 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-md">
            <div className="max-h-56 overflow-y-auto p-1">
              {FEATURES.map(feature => {
                const Icon = feature.icon
                return (
                  <button
                    key={feature.id}
                    onClick={() => setCreateType(feature.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent",
                      createType === feature.id && "bg-accent text-accent-foreground"
                    )}
                  >
                    <Icon className="size-4" />
                    <span className="flex-1">{feature.label}</span>
                    {createType === feature.id && <Check className="size-4" />}
                  </button>
                )
              })}
            </div>

            <div className="sticky bottom-0 flex gap-2 border-t bg-popover p-2">
              <Input
                ref={inputRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate()
                  if (e.key === 'Escape') {
                    setCreateOpen(false)
                    setNewName('')
                  }
                }}
                placeholder="New file name"
                className="h-8 text-xs"
                disabled={creating}
              />
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || creating}
                className="h-8 shrink-0 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              >
                Create
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
