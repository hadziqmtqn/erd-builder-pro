import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Node, Edge, Viewport } from '@xyflow/react';
import { FileData, Entity, Relationship, DraftType } from '../types';
import { localPersistence } from '../lib/localPersistence';

export function useFiles(isAuthenticated: boolean | null, view: string, isGuest: boolean = false) {
  const [files, setFiles] = useState<FileData[]>([]);
  const [activeFileId, setActiveFileId] = useState<number | string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [filesTotal, setFilesTotal] = useState(0);
  const [hasMoreFiles, setHasMoreFiles] = useState(false);
  const filesRef = useRef<FileData[]>(files);

  // Keep ref in sync
  filesRef.current = files;

  const fetchFiles = useCallback(async (isLoadMore = false, projectId: number | null | string = 'all', searchQuery = '') => {
    if (isGuest) {
      const localFiles = await localPersistence.getAllResources('erd');
      let filtered = localFiles.filter(f => !f.is_deleted);
      if (projectId !== 'all') {
        filtered = filtered.filter(f => f.project_id === projectId);
      }
      if (searchQuery) {
        filtered = filtered.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
      }
      setFiles(filtered);
      setFilesTotal(filtered.length);
      setHasMoreFiles(false);
      return;
    }

    try {
      const offset = isLoadMore ? filesRef.current.length : 0;
      const projIdParam = (projectId === null || projectId === 'null') ? 'null' : projectId;
      const qParam = searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : '';
      const res = await fetch(`/api/files?limit=10&offset=${offset}&project_id=${projIdParam}${qParam}`);
      if (res.ok) {
        const json = await res.json();
        const data = json.data !== undefined ? json.data : json; // Fallback to raw array
        const total = json.total !== undefined ? json.total : (Array.isArray(data) ? data.length : 0);
        
        const filesList = Array.isArray(data) ? data : [];
        if (isLoadMore) {
          setFiles(prev => [...prev, ...filesList]);
        } else {
          setFiles(filesList);
        }
        setFilesTotal(total);
        setHasMoreFiles((filesList.length + offset) < total);
      }
    } catch (err) {
      console.error('Error fetching files:', err);
    }
  }, [isGuest]); 

  const createFile = async (name: string, projectId?: number | null) => {
    if (isGuest) {
      const newFile: FileData = {
        id: Math.random().toString(36).substr(2, 9) as any, // String ID for guest
        name,
        project_id: projectId || null,
        is_deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        entities: [],
        relationships: [],
      };
      // @ts-ignore
      newFile.type = 'erd';
      await localPersistence.saveResource(newFile);
      setFiles(prev => [newFile, ...prev]);
      toast.success('Diagram created locally');
      return newFile;
    }

    try {
      const res = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, project_id: projectId }),
      });
      if (res.ok) {
        const newFile = await res.json();
        setFiles(prev => [newFile, ...prev]);
        toast.success('Diagram created successfully');
        return newFile;
      } else {
        toast.error('Failed to create diagram');
      }
    } catch (err) {
      console.error('Error creating file:', err);
      toast.error('Error creating diagram');
    }
    return null;
  };

  const updateFile = async (id: number | string, name: string) => {
    if (isGuest) {
      const file = await localPersistence.getResource(id);
      if (file) {
        file.name = name;
        file.updated_at = new Date().toISOString();
        await localPersistence.saveResource(file);
        setFiles(prev => prev.map(f => f.id === id ? { ...f, name } : f));
        toast.success('Diagram renamed locally');
      }
      return;
    }

    try {
      const res = await fetch(`/api/files/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setFiles(prev => prev.map(f => f.id === id ? { ...f, name } : f));
        toast.success('Diagram renamed successfully');
      } else {
        toast.error('Failed to rename diagram');
      }
    } catch (err) {
      console.error('Error updating file:', err);
      toast.error('Error renaming diagram');
    }
  };

  const deleteFile = async (id: number | string) => {
    if (isGuest) {
      const file = await localPersistence.getResource(id);
      if (file) {
        file.is_deleted = true;
        file.deleted_at = new Date().toISOString();
        await localPersistence.saveResource(file);
        setFiles(prev => prev.map(f => f.id === id ? { ...f, is_deleted: true } : f));
        if (activeFileId === id) setActiveFileId(null);
        toast.success('Diagram moved to local trash');
      }
      return;
    }

    try {
      const res = await fetch(`/api/files/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setFiles(prev => prev.map(f => f.id === id ? { ...f, is_deleted: true } : f));
        if (activeFileId === id) setActiveFileId(null);
        toast.success('Diagram moved to trash');
      } else {
        toast.error('Failed to delete diagram');
      }
    } catch (err) {
      console.error('Error deleting file:', err);
      toast.error('Error deleting diagram');
    }
  };

  const restoreFile = async (id: number | string) => {
    if (isGuest) {
      const file = await localPersistence.getResource(id);
      if (file) {
        file.is_deleted = false;
        file.deleted_at = undefined;
        await localPersistence.saveResource(file);
        fetchFiles();
        toast.success('Diagram restored locally');
      }
      return;
    }

    try {
      const res = await fetch(`/api/files/${id}/restore`, { method: 'POST' });
      if (res.ok) {
        fetchFiles();
        toast.success('Diagram restored successfully');
      } else {
        toast.error('Failed to restore diagram');
      }
    } catch (err) {
      toast.error('Error restoring diagram');
    }
  };

  const deleteFilePermanent = async (id: number | string) => {
    if (isGuest) {
      await localPersistence.deleteResource(id);
      await localPersistence.clearDraft(DraftType.ERD, id);
      toast.success('Diagram permanently deleted from local storage');
      return;
    }

    try {
      const res = await fetch(`/api/files/${id}/permanent`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Diagram permanently deleted');
      } else {
        toast.error('Failed to permanently delete diagram');
      }
    } catch (err) {
      toast.error('Error permanently deleting diagram');
    }
  };

  const moveFileToProject = async (fileId: number | string, projectId: number | null) => {
    if (isGuest) {
      const file = await localPersistence.getResource(fileId);
      if (file) {
        file.project_id = projectId;
        await localPersistence.saveResource(file);
        setFiles(prev => prev.map(f => f.id === fileId ? { ...f, project_id: projectId } : f));
        toast.success('Diagram moved to project locally');
        return true;
      }
      return false;
    }

    try {
      const res = await fetch(`/api/files/${fileId}/project`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      });
      if (res.ok) {
        setFiles(prev => prev.map(f => f.id === fileId ? { ...f, project_id: projectId } : f));
        toast.success('Diagram moved to project');
        return true;
      } else {
        toast.error('Failed to move diagram');
      }
    } catch (err) {
      console.error('Error moving file:', err);
      toast.error('Error moving diagram');
    }
  };

  const saveDiagram = useCallback(async (nodes: Node<Entity>[], edges: Edge[], viewport: Viewport) => {
    if (!activeFileId || view !== 'erd') return;
    if (!isAuthenticated && !isGuest) return;

    setSaveStatus('saving');

    const data = JSON.stringify({ nodes, edges, viewport });
    
    // Save to local IndexedDB first
    try {
      await localPersistence.saveDraft(DraftType.ERD, activeFileId, data, !isGuest);
    } catch (e) {
      console.warn('Local draft save failed', e);
    }

    if (isGuest) {
      // For guest, also update the main resource so it persists beyond "draft"
      try {
        const file = await localPersistence.getResource(activeFileId);
        if (file) {
          const entities: Entity[] = nodes.map(n => ({
            ...n.data,
            x: n.position.x,
            y: n.position.y,
          })) as Entity[];

          const relationships: Relationship[] = edges.map(e => ({
            id: e.id,
            source_entity_id: e.source,
            target_entity_id: e.target,
            source_column_id: e.sourceHandle ? e.sourceHandle.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '') : undefined,
            target_column_id: e.targetHandle ? e.targetHandle.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '') : undefined,
            source_handle: e.sourceHandle || undefined,
            target_handle: e.targetHandle || undefined,
            type: 'one-to-many',
            label: e.label as string,
          }));

          file.entities = entities;
          file.relationships = relationships;
          file.viewport_x = viewport.x;
          file.viewport_y = viewport.y;
          file.viewport_zoom = viewport.zoom;
          file.updated_at = new Date().toISOString();
          await localPersistence.saveResource(file);
        }
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch (e) {}
      return;
    }

    // Try to save to server only if online and authenticated
    if (navigator.onLine && isAuthenticated) {
      try {
        const entities: Entity[] = nodes.map(n => ({
          ...n.data,
          x: n.position.x,
          y: n.position.y,
        })) as Entity[];

        const relationships: Relationship[] = edges.map(e => ({
          id: e.id,
          source_entity_id: e.source,
          target_entity_id: e.target,
          source_column_id: e.sourceHandle ? e.sourceHandle.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '') : undefined,
          target_column_id: e.targetHandle ? e.targetHandle.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '') : undefined,
          source_handle: e.sourceHandle || undefined,
          target_handle: e.targetHandle || undefined,
          type: 'one-to-many',
          label: e.label as string,
        }));

        const res = await fetch(`/api/files/save/${activeFileId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entities, relationships, viewport }),
        });
        if (res.ok) {
          // Clear sync pending
          await localPersistence.saveDraft(DraftType.ERD, activeFileId, data, false);
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('idle'), 2000);
        } else {
          setSaveStatus('error');
        }
      } catch (err) {
        setSaveStatus('error');
        console.error('Error saving diagram to server:', err);
      }
    } else {
      // Offline: just stay in saving/saved state locally
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  }, [activeFileId, isAuthenticated, isGuest, view]);

  return {
    files,
    setFiles,
    activeFileId,
    setActiveFileId,
    saveStatus,
    setSaveStatus,
    fetchFiles,
    createFile,
    updateFile,
    deleteFile,
    restoreFile,
    deleteFilePermanent,
    moveFileToProject,
    saveDiagram,
    hasMoreFiles,
    filesTotal
  };
}
