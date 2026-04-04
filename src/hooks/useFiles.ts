import { useState, useCallback, useRef } from 'react';
import { Node, Edge, Viewport } from '@xyflow/react';
import { FileData, Entity, Relationship } from '../types';

export function useFiles(isAuthenticated: boolean | null, view: string) {
  const [files, setFiles] = useState<FileData[]>([]);
  const [activeFileId, setActiveFileId] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [filesTotal, setFilesTotal] = useState(0);
  const [hasMoreFiles, setHasMoreFiles] = useState(false);
  const filesRef = useRef<FileData[]>(files);

  // Keep ref in sync
  filesRef.current = files;

  const fetchFiles = useCallback(async (isLoadMore = false) => {
    try {
      const offset = isLoadMore ? filesRef.current.length : 0;
      const res = await fetch(`/api/files?limit=10&offset=${offset}`);
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
  }, []); // Stable dependency array

  const createFile = async (name: string, projectId?: number | null) => {
    try {
      const res = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, project_id: projectId }),
      });
      if (res.ok) {
        const newFile = await res.json();
        setFiles(prev => [newFile, ...prev]);
        return newFile;
      }
    } catch (err) {
      console.error('Error creating file:', err);
    }
    return null;
  };

  const updateFile = async (id: number, name: string) => {
    try {
      const res = await fetch(`/api/files/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setFiles(prev => prev.map(f => f.id === id ? { ...f, name } : f));
      }
    } catch (err) {
      console.error('Error updating file:', err);
    }
  };

  const deleteFile = async (id: number) => {
    try {
      const res = await fetch(`/api/files/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setFiles(prev => prev.map(f => f.id === id ? { ...f, is_deleted: true } : f));
        if (activeFileId === id) setActiveFileId(null);
      }
    } catch (err) {
      console.error('Error deleting file:', err);
    }
  };

  const restoreFile = async (id: number) => {
    try {
      const res = await fetch(`/api/files/${id}/restore`, { method: 'POST' });
      if (res.ok) {
        fetchFiles();
      }
    } catch (err) {}
  };

  const deleteFilePermanent = async (id: number) => {
    try {
      await fetch(`/api/files/${id}/permanent`, { method: 'DELETE' });
    } catch (err) {}
  };

  const moveFileToProject = async (fileId: number, projectId: number | null) => {
    try {
      const res = await fetch(`/api/files/${fileId}/project`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      });
      if (res.ok) {
        setFiles(prev => prev.map(f => f.id === fileId ? { ...f, project_id: projectId } : f));
        return true;
      }
    } catch (err) {
      console.error('Error moving file:', err);
    }
    return false;
  };

  const saveDiagram = useCallback(async (nodes: Node<Entity>[], edges: Edge[], viewport: Viewport) => {
    if (!activeFileId || !isAuthenticated || view !== 'erd') return;
    setSaveStatus('saving');

    const entities: Entity[] = nodes.map(n => ({
      ...n.data,
      x: n.position.x,
      y: n.position.y,
    })) as Entity[];

    const relationships: Relationship[] = edges.map(e => ({
      id: e.id,
      source_entity_id: e.source,
      target_entity_id: e.target,
      source_column_id: e.sourceHandle ? e.sourceHandle.replace('col-', '').replace('-source', '').replace('-target', '') : undefined,
      target_column_id: e.targetHandle ? e.targetHandle.replace('col-', '').replace('-source', '').replace('-target', '') : undefined,
      type: 'one-to-many',
      label: e.label as string,
    }));

    try {
      const res = await fetch(`/api/files/save/${activeFileId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entities, relationships, viewport }),
      });
      if (res.ok) {
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      }
    } catch (err) {
      setSaveStatus('error');
    }
  }, [activeFileId, isAuthenticated, view]);

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
