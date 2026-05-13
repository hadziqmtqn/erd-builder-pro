import { useMemo } from 'react';

interface AppMetadataProps {
  view: string;
  isPublicView: boolean;
  publicData: any;
  activeDiagramId: number | string | null;
  activeNoteUid: string | null;
  activeDrawingId: string | null;
  activeFlowchartId: number | string | null;
  diagrams: any[];
  notes: any[];
  drawings: any[];
  flowcharts: any[];
  projects: any[];
}

export const useAppMetadata = ({
  view,
  isPublicView,
  publicData,
  activeDiagramId,
  activeNoteUid,
  activeDrawingId,
  activeFlowchartId,
  diagrams,
  notes,
  drawings,
  flowcharts,
  projects,
}: AppMetadataProps) => {
  const currentActiveId = useMemo(() => {
    if (isPublicView) return undefined;
    const viewMap: Record<string, number | string | null> = { 
      erd: activeDiagramId, 
      notes: activeNoteUid, 
      drawings: activeDrawingId, 
      flowchart: activeFlowchartId 
    };
    return viewMap[view] || null;
  }, [view, isPublicView, activeDiagramId, activeNoteUid, activeDrawingId, activeFlowchartId]);

  const activeDocument = useMemo(() => {
    if (isPublicView) return publicData;
    const docArr = view === 'erd' ? diagrams : view === 'notes' ? notes : view === 'drawings' ? drawings : flowcharts;
    return docArr.find(d => String(d.uid ?? d.id) === String(currentActiveId));
  }, [view, currentActiveId, diagrams, notes, drawings, flowcharts, isPublicView, publicData]);

  const initialShareSettings = useMemo(() => {
    if (isPublicView) return publicData ? { is_public: !!publicData.is_public, share_token: publicData.share_token, expiry_date: publicData.expiry_date } : undefined;
    const docArr = view === 'erd' ? diagrams : view === 'notes' ? notes : view === 'drawings' ? drawings : flowcharts;
    const id = currentActiveId;
    const doc = docArr.find(d => String(d.uid ?? d.id) === String(id));
    if (!doc) return undefined;
    return { is_public: !!doc.is_public, share_token: doc.share_token, expiry_date: doc.expiry_date };
  }, [view, isPublicView, publicData, diagrams, notes, drawings, flowcharts, currentActiveId]);

  const activeNote = isPublicView ? publicData : notes.find(n => n.uid === activeNoteUid);
  const activeDrawing = isPublicView ? publicData : drawings.find(d => String(d.uid ?? d.id) === String(activeDrawingId));
  const activeFlowchart = isPublicView ? publicData : flowcharts.find(f => (f.uid && String(f.uid) === String(activeFlowchartId)) || String(f.id) === String(activeFlowchartId));
  const activeDiagram = isPublicView ? publicData : diagrams.find(f => String(f.id) === String(activeDiagramId) || (f.uid && f.uid === activeDiagramId));

  const featureLabel = isPublicView ? `Public Shared ${view}` : (view === 'erd' ? 'ERD Builder' : view === 'notes' ? 'Notes' : view === 'drawings' ? 'Drawings' : view === 'flowchart' ? 'Flowcharts' : view === 'changelog' ? 'Changelog' : view === 'backups' ? 'Backups' : 'Trash Bin');

  const activeFileName = isPublicView ? (publicData?.name || publicData?.title || 'Shared Document') : (view === 'erd' ? activeDiagram?.name : view === 'notes' ? activeNote?.title : view === 'drawings' ? activeDrawing?.title : view === 'flowchart' ? activeFlowchart?.title : null);
  const activeProjectName = isPublicView
    ? publicData?.projects?.name
    : (() => {
        const doc = view === 'erd' ? activeDiagram : view === 'notes' ? activeNote : view === 'drawings' ? activeDrawing : view === 'flowchart' ? activeFlowchart : null;
        if (!doc) return null;
        if (doc.projects?.name) return doc.projects.name;
        if (doc.project_id) {
          const project = projects.find(p => String(p.id) === String(doc.project_id));
          if (project) return project.name;
        }
        return null;
      })();
  const activeFileUid = isPublicView ? publicData?.uid : (view === 'erd' ? activeDiagram?.uid : view === 'notes' ? activeNote?.uid : view === 'drawings' ? activeDrawing?.uid : view === 'flowchart' ? activeFlowchart?.uid : undefined);

  return {
    currentActiveId,
    activeDocument,
    initialShareSettings,
    activeNote,
    activeDrawing,
    activeFlowchart,
    activeDiagram,
    featureLabel,
    activeFileName,
    activeProjectName,
    activeFileUid,
    hasActiveItem: !!activeDocument,
  };
};
