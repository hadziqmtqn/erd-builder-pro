import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ErdTableView } from '@/components/views/ErdTableView';
import { MoveToTrashAlert } from '@/components/modals/MoveToTrashAlert';
import { RenameDocumentDialog } from '@/components/modals/RenameDocumentDialog';
import { useDbClients } from '@/hooks/useDbClients';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { apiFetch } from '@/lib/api';

export function DbClientTableRoute() {
  const navigate = useNavigate();
  const { projects, selectedWorkspaceUid, tableSearchParams, setTableSearchParams, fileSearchQuery, setFileSearchQuery, fileSearchRef } = useWorkspace();
  const { dbClients, dbClientsTotal, isDbClientsLoading, fetchDbClients, deleteDbClient } = useDbClients();
  const [pendingDelete, setPendingDelete] = useState<any>(null);
  const [editingDbClient, setEditingDbClient] = useState<any>(null);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [renameProjectId, setRenameProjectId] = useState('none');
  const page = Math.max(1, Number(tableSearchParams.get('page')) || 1);
  const projectId = useMemo(() => {
    if (!selectedWorkspaceUid) return null;
    return projects.find((project: any) => String(project.uid) === String(selectedWorkspaceUid) || String(project.id) === String(selectedWorkspaceUid))?.id ?? null;
  }, [projects, selectedWorkspaceUid]);

  useEffect(() => {
    void fetchDbClients({ projectId, query: fileSearchQuery, page });
  }, [fetchDbClients, fileSearchQuery, page, projectId]);

  const updateParams = (nextPage: number, workspace = selectedWorkspaceUid) => {
    const params = new URLSearchParams(tableSearchParams);
    if (workspace) params.set('workspace', workspace); else params.delete('workspace');
    params.set('page', String(nextPage));
    setTableSearchParams(params, { replace: true });
  };

  const handleEditDbClient = (uid: string) => {
    const client = dbClients.find(item => String(item.uid ?? item.id) === String(uid));
    if (!client) return;
    setEditingDbClient(client);
    setNewName(client.name || '');
    setIsRenameDialogOpen(true);
  };

  const updateDbClient = async (uid: string, name: string) => {
    const response = await apiFetch(`/api/db-clients/${encodeURIComponent(uid)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) throw new Error('Failed to rename DB Client');
    await fetchDbClients({ projectId, query: fileSearchQuery, page });
  };

  return (
    <>
      <ErdTableView
        mode="db-client"
        diagrams={dbClients}
        projects={projects}
        selectedWorkspace={selectedWorkspaceUid}
        page={page}
        totalDiagrams={dbClientsTotal}
        isLoading={isDbClientsLoading}
        onSelectDiagram={uid => navigate(`/db-client/${uid}`)}
        onPageChange={next => updateParams(next)}
        onWorkspaceClick={workspace => updateParams(1, workspace)}
        onOpenEditDocument={handleEditDbClient}
        onDeleteDiagram={uid => setPendingDelete(dbClients.find(item => String(item.uid ?? item.id) === String(uid)))}
        searchQuery={fileSearchQuery}
        onSearchChange={setFileSearchQuery}
        searchRef={fileSearchRef}
      />
      <MoveToTrashAlert
        isOpen={!!pendingDelete}
        onOpenChange={open => { if (!open) setPendingDelete(null); }}
        activeDocument={pendingDelete}
        view="db-client"
        onConfirm={() => {
          const uid = pendingDelete?.uid ?? pendingDelete?.id;
          if (uid) void deleteDbClient(String(uid)).then(() => setPendingDelete(null));
        }}
      />
      <RenameDocumentDialog
        isOpen={isRenameDialogOpen}
        onOpenChange={open => { setIsRenameDialogOpen(open); if (!open) setEditingDbClient(null); }}
        view="db-client"
        activeDocument={editingDbClient}
        newName={newName}
        setNewName={setNewName}
        projects={projects}
        selectedProjectId={renameProjectId}
        setSelectedProjectId={setRenameProjectId}
        updateDbClient={updateDbClient}
      />
    </>
  );
}
