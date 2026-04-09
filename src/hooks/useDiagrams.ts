import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Node, Edge, Viewport } from '@xyflow/react';
import { Diagram, Entity, Relationship, DraftType } from '../types';
import { localPersistence } from '../lib/localPersistence';
import { RELATIONSHIP_TYPES } from '../lib/utils';

export function useDiagrams(isAuthenticated: boolean | null, view: 'erd' | 'diagram' | string, isGuest: boolean = false) {
  const [diagrams, setDiagrams] = useState<Diagram[]>([]);
  const [activeDiagramId, setActiveDiagramId] = useState<number | string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [diagramsTotal, setDiagramsTotal] = useState(0);
  const [hasMoreDiagrams, setHasMoreDiagrams] = useState(false);
  const diagramsRef = useRef<Diagram[]>(diagrams);

  // Keep ref in sync
  diagramsRef.current = diagrams;

  const fetchDiagrams = useCallback(async (isLoadMore = false, projectId: number | null | string = 'all', searchQuery = '') => {
    if (isGuest) {
      // For local, we still use 'erd' type internally to maintain existing data or we migrate it
      const localResources = await localPersistence.getAllResources('erd');
      let filtered = localResources.filter(f => !f.is_deleted);
      if (projectId !== 'all') {
        filtered = filtered.filter(f => f.project_id === projectId);
      }
      if (searchQuery) {
        filtered = filtered.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
      }
      setDiagrams(filtered);
      setDiagramsTotal(filtered.length);
      setHasMoreDiagrams(false);
      return;
    }

    try {
      const offset = isLoadMore ? diagramsRef.current.length : 0;
      const projIdParam = (projectId === null || projectId === 'null') ? 'null' : projectId;
      const qParam = searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : '';
      const res = await fetch(`/api/diagrams?limit=10&offset=${offset}&project_id=${projIdParam}${qParam}`);
      if (res.ok) {
        let json;
        try {
          json = await res.json();
        } catch (e) {
          console.error('Failed to parse JSON response in fetchDiagrams', e);
          return;
        }
        const data = json.data !== undefined ? json.data : (Array.isArray(json) ? json : []);
        const total = json.total !== undefined ? json.total : (Array.isArray(data) ? data.length : 0);
        
        const diagramsList = Array.isArray(data) ? data : [];
        if (isLoadMore) {
          setDiagrams(prev => [...prev, ...diagramsList]);
        } else {
          setDiagrams(diagramsList);
        }
        setDiagramsTotal(total);
        setHasMoreDiagrams((diagramsList.length + offset) < total);
      } else {
        const errText = await res.text();
        console.error(`Failed to fetch diagrams: ${res.status} ${res.statusText}`, errText);
      }
    } catch (err) {
      console.error('Error in fetchDiagrams:', err);
    }
  }, [isGuest]); 

  const createDiagram = async (name: string, projectId?: number | null) => {
    if (isGuest) {
      const newDiagram: Diagram = {
        id: Math.random().toString(36).substr(2, 9) as any,
        name,
        project_id: projectId || null,
        is_deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        entities: [],
        relationships: [],
      };
      // @ts-ignore
      newDiagram.type = 'erd';
      await localPersistence.saveResource(newDiagram);
      setDiagrams(prev => [newDiagram, ...prev]);
      toast.success('Diagram created locally');
      return newDiagram;
    }

    try {
      const res = await fetch('/api/diagrams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, project_id: projectId }),
      });
      if (res.ok) {
        const newDiagram = await res.json();
        setDiagrams(prev => [newDiagram, ...prev]);
        toast.success('Diagram created successfully');
        return newDiagram;
      } else {
        toast.error('Failed to create diagram');
      }
    } catch (err) {
      console.error('Error creating diagram:', err);
      toast.error('Error creating diagram');
    }
    return null;
  };

  const updateDiagram = async (id: number | string, name: string) => {
    if (isGuest) {
      const diagram = await localPersistence.getResource(id);
      if (diagram) {
        diagram.name = name;
        diagram.updated_at = new Date().toISOString();
        await localPersistence.saveResource(diagram);
        setDiagrams(prev => prev.map(f => f.id === id ? { ...f, name } : f));
        toast.success('Diagram renamed locally');
      }
      return;
    }

    try {
      const res = await fetch(`/api/diagrams/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setDiagrams(prev => prev.map(f => f.id === id ? { ...f, name } : f));
        toast.success('Diagram renamed successfully');
      } else {
        toast.error('Failed to rename diagram');
      }
    } catch (err) {
      console.error('Error updating diagram:', err);
      toast.error('Error renaming diagram');
    }
  };

  const deleteDiagram = async (id: number | string) => {
    if (isGuest) {
      const diagram = await localPersistence.getResource(id);
      if (diagram) {
        diagram.is_deleted = true;
        diagram.deleted_at = new Date().toISOString();
        await localPersistence.saveResource(diagram);
        setDiagrams(prev => prev.map(f => f.id === id ? { ...f, is_deleted: true } : f));
        if (activeDiagramId === id) setActiveDiagramId(null);
        toast.success('Diagram moved to local trash');
      }
      return;
    }

    try {
      const res = await fetch(`/api/diagrams/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setDiagrams(prev => prev.map(f => f.id === id ? { ...f, is_deleted: true } : f));
        if (activeDiagramId === id) setActiveDiagramId(null);
        toast.success('Diagram moved to trash');
      } else {
        toast.error('Failed to delete diagram');
      }
    } catch (err) {
      console.error('Error deleting diagram:', err);
      toast.error('Error deleting diagram');
    }
  };

  const restoreDiagram = async (id: number | string) => {
    if (isGuest) {
      const diagram = await localPersistence.getResource(id);
      if (diagram) {
        diagram.is_deleted = false;
        diagram.deleted_at = undefined;
        await localPersistence.saveResource(diagram);
        fetchDiagrams();
        toast.success('Diagram restored locally');
      }
      return;
    }

    try {
      const res = await fetch(`/api/diagrams/${id}/restore`, { method: 'POST' });
      if (res.ok) {
        fetchDiagrams();
        toast.success('Diagram restored successfully');
      } else {
        toast.error('Failed to restore diagram');
      }
    } catch (err) {
      toast.error('Error restoring diagram');
    }
  };

  const deleteDiagramPermanent = async (id: number | string) => {
    if (isGuest) {
      await localPersistence.deleteResource(id);
      await localPersistence.clearDraft(DraftType.ERD, id);
      toast.success('Diagram permanently deleted from local storage');
      return;
    }

    try {
      const res = await fetch(`/api/diagrams/${id}/permanent`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Diagram permanently deleted');
      } else {
        toast.error('Failed to permanently delete diagram');
      }
    } catch (err) {
      toast.error('Error permanently deleting diagram');
    }
  };

  const moveDiagramToProject = async (diagramId: number | string, projectId: number | null) => {
    if (isGuest) {
      const diagram = await localPersistence.getResource(diagramId);
      if (diagram) {
        diagram.project_id = projectId;
        await localPersistence.saveResource(diagram);
        setDiagrams(prev => prev.map(f => f.id === diagramId ? { ...f, project_id: projectId } : f));
        toast.success('Diagram moved to project locally');
        return true;
      }
      return false;
    }

    try {
      const res = await fetch(`/api/diagrams/${diagramId}/project`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      });
      if (res.ok) {
        setDiagrams(prev => prev.map(f => f.id === diagramId ? { ...f, project_id: projectId } : f));
        toast.success('Diagram moved to project');
        return true;
      } else {
        toast.error('Failed to move diagram');
      }
    } catch (err) {
      console.error('Error moving diagram:', err);
      toast.error('Error moving diagram');
    }
  };

  const saveDiagram = useCallback(async (nodes: Node<Entity>[], edges: Edge[], viewport: Viewport) => {
    if (!activeDiagramId || (view !== 'erd' && view !== 'diagram')) return;
    if (!isAuthenticated && !isGuest) return;

    setSaveStatus('saving');

    const data = JSON.stringify({ nodes, edges, viewport });
    
    // Save to local IndexedDB first
    try {
      await localPersistence.saveDraft(DraftType.DIAGRAM, activeDiagramId, data, !isGuest);
    } catch (e) {
      console.warn('Local draft save failed', e);
    }

    if (isGuest) {
      try {
        const diagram = await localPersistence.getResource(activeDiagramId);
        if (diagram) {
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
            type: RELATIONSHIP_TYPES.find(t => t.label === e.label)?.value || 'one-to-many',
            label: e.label as string,
          }));

          diagram.entities = entities;
          diagram.relationships = relationships;
          diagram.viewport_x = viewport.x;
          diagram.viewport_y = viewport.y;
          diagram.viewport_zoom = viewport.zoom;
          diagram.updated_at = new Date().toISOString();
          await localPersistence.saveResource(diagram);
        }
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch (e) {}
      return;
    }

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
          type: RELATIONSHIP_TYPES.find(t => t.shortLabel === e.label)?.value || 'one-to-many',
          label: e.label as string,
        }));

        const res = await fetch(`/api/diagrams/save/${activeDiagramId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entities, relationships, viewport }),
        });
        if (res.ok) {
          await localPersistence.saveDraft(DraftType.DIAGRAM, activeDiagramId, data, false);
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
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  }, [activeDiagramId, isAuthenticated, isGuest, view]);

  return {
    diagrams,
    setDiagrams,
    activeDiagramId,
    setActiveDiagramId,
    saveStatus,
    setSaveStatus,
    fetchDiagrams,
    createDiagram,
    updateDiagram,
    deleteDiagram,
    restoreDiagram,
    deleteDiagramPermanent,
    moveDiagramToProject,
    saveDiagram,
    hasMoreDiagrams,
    diagramsTotal
  };
}
