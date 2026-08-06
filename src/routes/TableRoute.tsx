import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useWorkspace } from '@/providers/WorkspaceProvider';

import { NotesTableView } from '@/components/views/NotesTableView';
import { ErdTableView } from '@/components/views/ErdTableView';
import { DrawingsTableView } from '@/components/views/DrawingsTableView';
import { FlowchartTableView } from '@/components/views/FlowchartTableView';
import { WelcomeView } from '@/components/views/WelcomeView';

export function TableRoute() {
  const { feature } = useParams<{ feature: string }>();
  const navigate = useNavigate();

  const {
    notes, notesTotal, diagrams, diagramsTotal, drawings, drawingsTotal,
    flowcharts, flowchartsTotal, projects,
    selectedWorkspaceUid, tableSearchParams, setTableSearchParams,
    handleNoteSelect, handleDiagramSelect, handleDrawingSelect, handleFlowchartSelect,
    handleOpenEditDocument, handleOpenCreateDocument,
    setItemToDelete, setIsMoveToTrashAlertOpen,
    setTableDeleteDoc,
    isNotesLoading, isDiagramsLoading, isDrawingsLoading, isFlowchartsLoading,
    setTableLoadingState,
    fileSearchQuery, setFileSearchQuery, fileSearchRef,
  } = useWorkspace();

  const openDiagram = (uid: string, dbClient = false) => {
    const selected = handleDiagramSelect(uid);
    if (dbClient) Promise.resolve(selected).then(() => navigate(`/diagrams/${uid}?feature=db-client`));
  };

  const tablePage = parseInt(tableSearchParams.get('page') || '1', 10);

  const handlePageChange = (p: number) => {
    setTableLoadingState('loading');
    const params = new URLSearchParams(tableSearchParams);
    params.set('page', String(p));
    setTableSearchParams(params, { replace: true });
  };

  const handleWorkspaceClick = (uid: string | null) => {
    setTableLoadingState('loading');
    const params = new URLSearchParams(tableSearchParams);
    if (uid) {
      params.set('workspace', uid);
    } else {
      params.delete('workspace');
    }
    params.set('page', '1');
    setTableSearchParams(params, { replace: true });
  };

  const makeDeleteHandler = (items: any[] | undefined | null) => (uid: string) => {
    const item = items?.find((n: any) => n.uid === uid || String(n.id) === uid || n.key === uid);
    if (!item) return;
    setItemToDelete({ id: item.id || item.uid, type: item.type, uid: item.uid });
    setTableDeleteDoc(item);
    setIsMoveToTrashAlertOpen(true);
  };

  switch (feature) {
    case 'notes':
      return (
        <NotesTableView
          notes={notes}
          projects={projects}
          selectedWorkspace={selectedWorkspaceUid}
          page={tablePage}
          totalNotes={notesTotal}
          isLoading={isNotesLoading}
          onSelectNote={handleNoteSelect}
          onCreateNote={() => handleOpenCreateDocument('notes')}
          onPageChange={handlePageChange}
          onWorkspaceClick={handleWorkspaceClick}
          onOpenEditDocument={(uid: string) => handleOpenEditDocument(uid)}
          onDeleteNote={makeDeleteHandler(notes)}
          searchQuery={fileSearchQuery}
          onSearchChange={setFileSearchQuery}
          searchRef={fileSearchRef}
        />
      );
    case 'erd':
      return (
        <ErdTableView
          diagrams={diagrams}
          projects={projects}
          selectedWorkspace={selectedWorkspaceUid}
          page={tablePage}
          totalDiagrams={diagramsTotal}
          isLoading={isDiagramsLoading}
          onSelectDiagram={(uid) => openDiagram(uid)}
          onCreateDiagram={() => handleOpenCreateDocument('erd')}
          onPageChange={handlePageChange}
          onWorkspaceClick={handleWorkspaceClick}
          onOpenEditDocument={(uid: string) => handleOpenEditDocument(uid)}
          onDeleteDiagram={makeDeleteHandler(diagrams)}
          searchQuery={fileSearchQuery}
          onSearchChange={setFileSearchQuery}
          searchRef={fileSearchRef}
        />
      );
    case 'db-client':
      return (
        <ErdTableView
          mode="db-client"
          diagrams={diagrams}
          projects={projects}
          selectedWorkspace={selectedWorkspaceUid}
          page={tablePage}
          totalDiagrams={diagramsTotal}
          isLoading={isDiagramsLoading}
          onSelectDiagram={(uid) => openDiagram(uid, true)}
          onPageChange={handlePageChange}
          onWorkspaceClick={handleWorkspaceClick}
          onOpenEditDocument={(uid: string) => handleOpenEditDocument(uid)}
          onDeleteDiagram={makeDeleteHandler(diagrams)}
          searchQuery={fileSearchQuery}
          onSearchChange={setFileSearchQuery}
          searchRef={fileSearchRef}
        />
      );
    case 'drawings':
      return (
        <DrawingsTableView
          drawings={drawings}
          projects={projects}
          selectedWorkspace={selectedWorkspaceUid}
          page={tablePage}
          totalDrawings={drawingsTotal}
          isLoading={isDrawingsLoading}
          onSelectDrawing={handleDrawingSelect}
          onCreateDrawing={() => handleOpenCreateDocument('drawings')}
          onPageChange={handlePageChange}
          onWorkspaceClick={handleWorkspaceClick}
          onOpenEditDocument={(uid: string) => handleOpenEditDocument(uid)}
          onDeleteDrawing={makeDeleteHandler(drawings)}
          searchQuery={fileSearchQuery}
          onSearchChange={setFileSearchQuery}
          searchRef={fileSearchRef}
        />
      );
    case 'flowchart':
      return (
        <FlowchartTableView
          flowcharts={flowcharts}
          projects={projects}
          selectedWorkspace={selectedWorkspaceUid}
          page={tablePage}
          totalFlowcharts={flowchartsTotal}
          isLoading={isFlowchartsLoading}
          onSelectFlowchart={handleFlowchartSelect}
          onCreateFlowchart={() => handleOpenCreateDocument('flowchart')}
          onPageChange={handlePageChange}
          onWorkspaceClick={handleWorkspaceClick}
          onOpenEditDocument={(uid: string) => handleOpenEditDocument(uid)}
          onDeleteFlowchart={makeDeleteHandler(flowcharts)}
          searchQuery={fileSearchQuery}
          onSearchChange={setFileSearchQuery}
          searchRef={fileSearchRef}
        />
      );
    default:
      return <WelcomeView />;
  }
}
