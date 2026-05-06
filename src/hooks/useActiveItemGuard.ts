import { useEffect } from 'react';
import { toast } from 'sonner';

interface ActiveItemGuardProps {
  view: string;
  activeDiagramId: number | string | null;
  activeNoteUid: number | string | null;
  activeDrawingId: number | string | null;
  activeFlowchartId: number | string | null;
  diagrams: any[];
  notes: any[];
  drawings: any[];
  flowcharts: any[];
  projects: any[];
  isPublicView: boolean;
  setActiveDiagramId: (id: number | string | null) => void;
  setActiveNoteUid: (uid: string | null) => void;
  setActiveDrawingId: (id: number | string | null) => void;
  setActiveFlowchartId: (id: number | string | null) => void;
  setActiveProjectId: (id: number | string | null) => void;
}

export const useActiveItemGuard = ({
  view,
  activeDiagramId,
  activeNoteUid,
  activeDrawingId,
  activeFlowchartId,
  diagrams,
  notes,
  drawings,
  flowcharts,
  projects,
  isPublicView,
  setActiveDiagramId,
  setActiveNoteUid,
  setActiveDrawingId,
  setActiveFlowchartId,
  setActiveProjectId,
}: ActiveItemGuardProps) => {
  useEffect(() => {
    if (isPublicView) return;

    const checkActiveItemHealth = () => {
      let activeItem: any = null;
      if (view === 'erd' && activeDiagramId) activeItem = diagrams.find(f => String(f.id) === String(activeDiagramId));
      else if (view === 'notes' && activeNoteUid) activeItem = notes.find(n => String(n.uid) === String(activeNoteUid));
      else if (view === 'drawings' && activeDrawingId) activeItem = drawings.find(d => String(d.id) === String(activeDrawingId));
      else if (view === 'flowchart' && activeFlowchartId) activeItem = flowcharts.find(f => String(f.id) === String(activeFlowchartId));

      if (activeItem && activeItem.is_deleted) {
        if (view === 'erd') setActiveDiagramId(null);
        else if (view === 'notes') setActiveNoteUid(null);
        else if (view === 'drawings') setActiveDrawingId(null);
        else if (view === 'flowchart') setActiveFlowchartId(null);
        
        toast.info("Document closed because it was moved to trash.");
        return;
      }

      if (activeItem && activeItem.project_id) {
        const parentProject = projects.find(p => String(p.id) === String(activeItem.project_id));
        if (parentProject && parentProject.is_deleted) {
          setActiveProjectId(null);
          setActiveDiagramId(null);
          setActiveNoteUid(null);
          setActiveDrawingId(null);
          setActiveFlowchartId(null);
          toast.warning("Project was deleted. Closing current document.");
        }
      }
    };

    checkActiveItemHealth();
  }, [
    view, activeDiagramId, activeNoteUid, activeDrawingId, activeFlowchartId, 
    diagrams, notes, drawings, flowcharts, projects, isPublicView,
    setActiveDiagramId, setActiveNoteUid, setActiveDrawingId, setActiveFlowchartId, setActiveProjectId
  ]);
};
