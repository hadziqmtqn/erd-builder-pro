import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FileText, Database, GitBranch, PenTool, ChevronDown, Plus } from 'lucide-react'
import { useWorkspace } from '@/providers/WorkspaceProvider'
import { Input } from '@/components/ui/input'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'

type FeatureTab = 'notes' | 'erd' | 'flowchart' | 'drawings'

const TABS: { id: FeatureTab; label: string; icon: React.ElementType; route: string; apiPath: string }[] = [
  { id: 'notes', label: 'Notes', icon: FileText, route: '/notes', apiPath: '/api/notes' },
  { id: 'erd', label: 'ERD Builder', icon: Database, route: '/diagrams', apiPath: '/api/diagrams' },
  { id: 'flowchart', label: 'Flowchart', icon: GitBranch, route: '/flowcharts', apiPath: '/api/flowcharts' },
  { id: 'drawings', label: 'Drawings', icon: PenTool, route: '/drawings', apiPath: '/api/drawings' },
]

interface Props {
  currentView: string
}

export function ProjectFileTabs({ currentView }: Props) {
  const [openTab, setOpenTab] = useState<FeatureTab | null>(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const tabsRef = useRef<HTMLDivElement>(null)
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const {
    activeProjectId,
    activeDiagram, activeNote, activeDrawing, activeFlowchart,
    diagrams, notes, drawings, flowcharts,
    fetchDiagrams, fetchNotes, fetchDrawings, fetchFlowcharts,
  } = useWorkspace()

  useEffect(() => {
    if (!openTab) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      // Don't close if clicking a trigger button
      if (Object.values(triggerRefs.current).some(el => el && el.contains(target))) return
      if (popoverRef.current && !popoverRef.current.contains(target)) {
        setOpenTab(null)
        setNewName('')
        setTriggerRect(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openTab])

  useEffect(() => {
    if (openTab) {
      const el = triggerRefs.current[openTab]
      if (el) setTriggerRect(el.getBoundingClientRect())
      setTimeout(() => inputRef.current?.focus(), 0)
    } else {
      setTriggerRect(null)
    }
  }, [openTab])

  // Reposition on scroll/resize (window + tabs container)
  useEffect(() => {
    if (!openTab) return
    const update = () => {
      const el = triggerRefs.current[openTab]
      if (el) setTriggerRect(el.getBoundingClientRect())
    }
    const tabsEl = tabsRef.current
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    tabsEl?.addEventListener('scroll', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
      tabsEl?.removeEventListener('scroll', update)
    }
  }, [openTab])

  const getProjectId = (): string | number | null => {
    if (activeProjectId && activeProjectId !== 'all') return activeProjectId
    const activeFile = (() => {
      switch (currentView) {
        case 'notes': return activeNote
        case 'erd': return activeDiagram
        case 'flowchart': return activeFlowchart
        case 'drawings': return activeDrawing
      }
    })()
    if (activeFile?.project_id ?? activeFile?.projectId) return activeFile.project_id ?? activeFile.projectId
    const urlPid = searchParams.get('pid')
    if (urlPid) return urlPid
    return null
  }

  const projectId = getProjectId()

  const toggleTab = (tab: FeatureTab) => {
    if (openTab === tab) { setOpenTab(null); setNewName(''); setTriggerRect(null) }
    else { setOpenTab(tab); setNewName('') }
  }

  const getFiles = (tab: FeatureTab) => {
    if (!projectId) return []
    const filterByProject = (items: any[]) =>
      items.filter((f: any) => {
        const pid = f.project_id ?? f.projectId
        return String(pid) === String(projectId)
      })
    switch (tab) {
      case 'notes': return filterByProject(notes)
      case 'erd': return filterByProject(diagrams)
      case 'flowchart': return filterByProject(flowcharts)
      case 'drawings': return filterByProject(drawings)
    }
  }

  const navigateTo = (tab: FeatureTab, file: any) => {
    const uid = file.uid || file.id
    const found = TABS.find(t => t.id === tab)
    if (found) navigate(`${found.route}/${uid}?pid=${projectId}`)
    setOpenTab(null)
    setTriggerRect(null)
  }

  const handleCreate = async (tab: FeatureTab) => {
    const name = newName.trim()
    if (!name || creating) return
    setCreating(true)
    try {
      const found = TABS.find(t => t.id === tab)
      if (!found) return
      const uid = crypto.randomUUID()
      const body: any = { uid, project_id: String(projectId) }
      if (tab === 'notes') { body.title = name; body.content = '' }
      else if (tab === 'erd') body.name = name
      else { body.title = name; body.data = tab === 'flowchart' ? '{"nodes":[],"edges":[]}' : '[]' }

      const res = await apiFetch(found.apiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setNewName('')
        setOpenTab(null)
        setTriggerRect(null)
        const fetchMap: Record<string, () => Promise<any>> = {
          notes: () => fetchNotes(false, projectId),
          erd: () => fetchDiagrams(false, projectId),
          flowchart: () => fetchFlowcharts(false, projectId),
          drawings: () => fetchDrawings(false, projectId),
        }
        await fetchMap[tab]?.()
        navigate(`${found.route}/${uid}?pid=${projectId}`)
      }
    } catch { /* silent */ }
    finally { setCreating(false) }
  }

  if (!projectId) return null

  const popover = openTab && triggerRect && (
    createPortal(
      <div
        ref={popoverRef}
        style={{
          position: 'fixed',
          top: triggerRect.bottom + 4,
          left: triggerRect.left,
        }}
        className="z-50 w-56 rounded-lg border bg-popover shadow-md overflow-hidden"
      >
        <div className="max-h-56 overflow-y-auto custom-scrollbar py-1">
          {(() => {
            const files = getFiles(openTab)
            return files.length === 0 ? (
              <div className="px-3 py-3 text-[11px] text-muted-foreground text-center">
                No {TABS.find(t => t.id === openTab)?.label.toLowerCase()} in this project
              </div>
            ) : (
              files.map((file: any) => (
                <button
                  key={file.uid || file.id}
                  onClick={() => navigateTo(openTab, file)}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors truncate"
                >
                  {file.title || file.name || 'Untitled'}
                </button>
              ))
            )
          })()}
        </div>
        <div className="border-t border-border/50 px-2 py-1.5 flex items-center gap-1.5">
          <Input
            ref={inputRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate(openTab)
              if (e.key === 'Escape') { setOpenTab(null); setNewName('') }
            }}
            placeholder={`New ${TABS.find(t => t.id === openTab)?.label.slice(0, -1)}...`}
            className="h-7 text-[11px]"
            disabled={creating}
          />
          <button
            onClick={() => handleCreate(openTab)}
            disabled={!newName.trim() || creating}
            className="shrink-0 h-7 w-7 rounded-md flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>,
      document.body
    )
  )

  return (
    <>
      <div ref={tabsRef} className="flex items-center justify-start sm:justify-center gap-0.5 px-3 py-1 border-b bg-muted/5 shrink-0 overflow-x-auto scrollbar-hide">
        {TABS.map(tab => {
          const files = getFiles(tab.id)
          const isActive = currentView === tab.id
          const isOpen = openTab === tab.id
          return (
            <div key={tab.id} className="shrink-0">
              <button
                ref={(el) => { triggerRefs.current[tab.id] = el }}
                onClick={() => toggleTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap",
                  isActive
                    ? 'bg-accent text-accent-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                )}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
                <span className="text-[10px] opacity-60 ml-0.5">({files.length})</span>
                <ChevronDown className={cn("w-3 h-3 transition-transform", isOpen && "rotate-180")} />
              </button>
            </div>
          )
        })}
      </div>
      {popover}
    </>
  )
}
