import { useCallback } from 'react';

// ──────────────────────────────────────────
// Props
// ──────────────────────────────────────────
export interface UseDocumentActionsParams {
  view: string;
  notes: any[];
  diagrams: any[];
  drawings: any[];
  flowcharts: any[];
  projects: any[];
  selectedWorkspaceUid: string | null;
  setEditDialogNote: (doc: any | null) => void;
  setNewName: (name: string) => void;
  setRenameProjectId: (id: string) => void;
  setIsRenameDialogOpen: (open: boolean) => void;
  setCreateDialogOpen: (open: boolean) => void;
  setCreateDialogView: (view: string) => void;
}

// ──────────────────────────────────────────
// Return type
// ──────────────────────────────────────────
export interface UseDocumentActionsReturn {
  handleOpenEditDocument: (uid: string) => void;
  handleOpenCreateDocument: (featureView: string) => void;
}

// ──────────────────────────────────────────
// Hook
// ──────────────────────────────────────────
/**
 * Document actions for table view:
 *  - handleOpenEditDocument: open rename dialog for a document from table view
 *  - handleOpenCreateDocument: open create dialog for a new document from table view
 *
 * Extracted from App.tsx to keep document action logic contained.
 */
export function useDocumentActions(params: UseDocumentActionsParams): UseDocumentActionsReturn {
  const {
    view, notes, diagrams, drawings, flowcharts, projects,
    selectedWorkspaceUid,
    setEditDialogNote, setNewName, setRenameProjectId,
    setIsRenameDialogOpen, setCreateDialogOpen, setCreateDialogView,
  } = params;

  // Open RenameDocumentDialog for a document from table view (no activeDocument)
  const handleOpenEditDocument = useCallback((uid: string) => {
    let doc: any = null;
    if (view === 'notes') {
      doc = notes?.find((n: any) => n.uid === uid || String(n.id) === uid);
    } else if (view === 'erd') {
      doc = diagrams?.find((d: any) => d.uid === uid || String(d.id) === uid);
    } else if (view === 'drawings') {
      doc = drawings?.find((d: any) => d.uid === uid || String(d.id) === uid);
    } else if (view === 'flowchart') {
      doc = flowcharts?.find((f: any) => f.uid === uid || String(f.id) === uid);
    }
    if (!doc) return;
    setEditDialogNote(doc);
    setNewName(doc.title || doc.name || '');
    const currentProject = projects?.find((proj: any) => String(proj.id) === String(doc.project_id) || String(proj.uid) === String(doc.project_id) || String(proj.uid) === String(doc.projects?.uid));
    setRenameProjectId(currentProject ? String(currentProject.id) : 'none');
    setIsRenameDialogOpen(true);
  }, [view, notes, diagrams, drawings, flowcharts, projects, setEditDialogNote, setNewName, setRenameProjectId, setIsRenameDialogOpen]);

  // Open RenameDocumentDialog for creating a document from table view
  const handleOpenCreateDocument = useCallback((featureView: string) => {
    setNewName('');
    // Pre-select current workspace filter if it matches a known project
    if (selectedWorkspaceUid) {
      const p = projects?.find((proj: any) => proj.uid === selectedWorkspaceUid);
      if (p) {
        setRenameProjectId(String(p.id));
      } else {
        setRenameProjectId('none');
      }
    } else {
      setRenameProjectId('none');
    }
    setCreateDialogView(featureView);
    setCreateDialogOpen(true);
    setEditDialogNote(null);
  }, [selectedWorkspaceUid, projects, setNewName, setRenameProjectId, setCreateDialogView, setCreateDialogOpen, setEditDialogNote]);

  return { handleOpenEditDocument, handleOpenCreateDocument };
}
