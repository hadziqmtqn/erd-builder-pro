import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { Node, Edge, Viewport } from '@xyflow/react';
import { Diagram, Entity, Relationship, DraftType } from '../types';
import { localPersistence } from '../lib/localPersistence';
import { RELATIONSHIP_TYPES } from '../lib/utils';
import { apiFetch } from '../lib/api';
import { getCachedDiagramVersion } from '../lib/diagramVersioning';

export function useDiagrams(isAuthenticated: boolean | null, view: 'erd' | 'diagram' | string, isGuest: boolean = false) {
  const [diagrams, setDiagrams] = useState<Diagram[]>([]);
  const [activeDiagramId, setActiveDiagramId] = useState<number | string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [diagramsTotal, setDiagramsTotal] = useState(0);
  const [hasMoreDiagrams, setHasMoreDiagrams] = useState(false);
  const diagramsRef = useRef<Diagram[]>(diagrams);
  const activeDiagramIdRef = useRef(activeDiagramId);

  const isGuestRef = useRef(isGuest);
  useEffect(() => { isGuestRef.current = isGuest; }, [isGuest]);
  const isGuestCheck = (): boolean =>
    isGuestRef.current || sessionStorage.getItem('auth_mode') === 'guest';

  // Keep refs in sync
  diagramsRef.current = diagrams;
  activeDiagramIdRef.current = activeDiagramId;

  const fetchDiagrams = useCallback(async (isLoadMore = false, projectId: number | null | string = 'all', searchQuery = '', isPublic: boolean | null = null, limit = 10, page?: number, options?: { silent?: boolean }) => {
    if (isGuestCheck()) {
      const [localResources, localProjects] = await Promise.all([
        localPersistence.getAllResources('erd'),
        localPersistence.getAllResources('project'),
      ]);
      const projectMap = new Map(
        localProjects
          .filter((p: any) => !p.is_deleted)
          .map((p: any) => [String(p.id), { uid: p.uid || String(p.id), name: p.name }])
      );
      let filtered = localResources.filter((f: any) => !f.is_deleted);
      if (projectId !== 'all') {
        filtered = filtered.filter((f: any) => String(f.project_id) === String(projectId));
      }
      if (searchQuery) {
        filtered = filtered.filter((f: any) => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
      }
      const enriched = filtered.map((f: any) => ({
        ...f,
        projects: f.projects || projectMap.get(String(f.project_id)) || null,
      }));

      // Sort: newest first by created_at
      enriched.sort((a: any, b: any) => {
        const da = a.created_at ? new Date(a.created_at).getTime() : 0;
        const db = b.created_at ? new Date(b.created_at).getTime() : 0;
        return db - da;
      });

      // Paginate
      const pageSize = limit;
      const pageNum = page !== undefined ? page : 1;
      const startIdx = (pageNum - 1) * pageSize;
      const paged = enriched.slice(startIdx, startIdx + pageSize);

      setDiagrams(paged);
      setDiagramsTotal(enriched.length);
      setHasMoreDiagrams(false);
      setIsLoading(false);
      return;
    }

    if (!options?.silent) setIsLoading(true);
    try {
      const offset = page !== undefined ? (page - 1) * limit : (isLoadMore ? diagramsRef.current.length : 0);
      const projIdParam = (projectId === null || projectId === 'null' || projectId === 'none') ? 'null' : projectId;
      const qParam = searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : '';
      const publicParam = isPublic !== null ? `&is_public=${isPublic}` : '';
      const res = await apiFetch(`/api/diagrams?limit=${limit}&offset=${offset}&project_id=${projIdParam}${qParam}${publicParam}`);
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
          setDiagrams(prev => {
            const activeId = activeDiagramIdRef.current;
            if (activeId != null && !diagramsList.some(d => String(d.id) === String(activeId) || (d.uid && String(d.uid) === String(activeId)))) {
              const existing = prev.find(d => String(d.id) === String(activeId) || (d.uid && String(d.uid) === String(activeId)));
              if (existing) return [...diagramsList, existing];
            }
            return diagramsList;
          });
        }
        setDiagramsTotal(total);
        setHasMoreDiagrams((diagramsList.length + offset) < total);
      } else {
        const errText = await res.text();
        console.error(`Failed to fetch diagrams: ${res.status} ${res.statusText}`, errText);
      }
    } catch (err) {
      console.error('Error in fetchDiagrams:', err);
    } finally {
      setIsLoading(false);
    }
  }, []); 

  const createDiagram = async (name: string, projectId?: number | string | null) => {
    const effectiveProjectId = (projectId === 'none' || projectId === 'uncategorized') ? null : projectId;

    if (isGuestCheck()) {
      const newDiagram = {
        id: Math.random().toString(36).substring(2, 11),
        uid: crypto.randomUUID(),
        name,
        project_id: effectiveProjectId || null,
        is_deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        entities: [],
        relationships: [],
        type: 'erd',
      } as Diagram & { type: string };
      await localPersistence.saveResource(newDiagram);
      setDiagrams(prev => [newDiagram, ...prev]);
      toast.success('Diagram created locally');
      return newDiagram;
    }

    try {
      const createUid = crypto.randomUUID();
      const res = await apiFetch('/api/diagrams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, project_id: effectiveProjectId, uid: createUid }),
      });
      if (res.ok) {
        const newDiagram = await res.json();
        if (!newDiagram.uid) {
          newDiagram.uid = createUid;
        }
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

  const updateDiagram = async (id: number | string, name: string, options?: { silent?: boolean }) => {
    if (isGuestCheck()) {
      const diagram = await localPersistence.getResource(id);
      if (diagram) {
        diagram.name = name;
        diagram.updated_at = new Date().toISOString();
        await localPersistence.saveResource(diagram);
        setDiagrams(prev => prev.map(f => f.id === id ? { ...f, name } : f));
        if (!options?.silent) toast.success('Diagram renamed locally');
      }
      return;
    }

    try {
      const diagram = diagramsRef.current.find(d => String(d.id) === String(id) || String(d.uid) === String(id));
      const identifier = diagram?.uid || id;
      const res = await apiFetch(`/api/diagrams/${identifier}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setDiagrams(prev => prev.map(f => f.id === id ? { ...f, name } : f));
        if (!options?.silent) toast.success('Diagram renamed successfully');
      } else {
        toast.error('Failed to rename diagram');
      }
    } catch (err) {
      console.error('Error updating diagram:', err);
      toast.error('Error renaming diagram');
    }
  };

  const deleteDiagram = async (id: number | string) => {
    if (isGuestCheck()) {
      let diagram = await localPersistence.getResource(id);
      // In guest mode, MoveToTrashAlert passes uid (UUID), but IndexedDB key is numeric/string id.
      // Fall back to searching all resources by uid if direct getResource fails.
      if (!diagram) {
        const all = await localPersistence.getAllResources('erd');
        diagram = all.find((d: any) => String(d.uid) === String(id) || String(d.id) === String(id)) || null;
      }
      if (diagram) {
        diagram.is_deleted = true;
        diagram.deleted_at = new Date().toISOString();
        await localPersistence.saveResource(diagram);
        setDiagrams(prev => prev.filter(f => String(f.id) !== String(id) && String(f.uid) !== String(id)));
        setDiagramsTotal(prev => Math.max(0, prev - 1));
        if (activeDiagramId === id || String(activeDiagramId) === String(id)) setActiveDiagramId(null);
        toast.success('Diagram moved to local trash');
      }
      return;
    }

    try {
      const diagram = diagramsRef.current.find(d => String(d.id) === String(id) || String(d.uid) === String(id));
      const identifier = diagram?.uid || id;
      const res = await apiFetch(`/api/diagrams/${identifier}`, { method: 'DELETE' });
      if (res.ok) {
        setDiagrams(prev => prev.filter(f => f.id !== id));
        setDiagramsTotal(prev => Math.max(0, prev - 1));
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
    if (isGuestCheck()) {
      let diagram = await localPersistence.getResource(id);
      if (!diagram) {
        const all = await localPersistence.getAllResources('erd');
        diagram = all.find((d: any) => String(d.uid) === String(id) || String(d.id) === String(id)) || null;
      }
      if (diagram) {
        diagram.is_deleted = false;
        diagram.deleted_at = undefined;
        await localPersistence.saveResource(diagram);
        setDiagrams(prev => prev.map(d => String(d.id) === String(id) || String(d.uid) === String(id) ? { ...d, is_deleted: false } : d));
        toast.success('Diagram restored locally');
      }
      return;
    }

    try {
      const diagram = diagramsRef.current.find(d => String(d.id) === String(id) || String(d.uid) === String(id));
      const identifier = diagram?.uid || id;
      const res = await apiFetch(`/api/diagrams/${identifier}/restore`, { method: 'POST' });
      if (res.ok) {
        // Optimistically update the state instead of full fetch to avoid losing other project data
        setDiagrams(prev => prev.map(d => String(d.id) === String(id) ? { ...d, is_deleted: false } : d));
        toast.success('Diagram restored successfully');
      } else {
        toast.error('Failed to restore diagram');
      }
    } catch (err) {
      toast.error('Error restoring diagram');
    }
  };

  const deleteDiagramPermanent = async (id: number | string) => {
    if (isGuestCheck()) {
      // Find resource by uid or id (MoveToTrashAlert passes uid UUID, but IndexedDB key is id)
      let diagram = await localPersistence.getResource(id);
      if (!diagram) {
        const all = await localPersistence.getAllResources('erd');
        diagram = all.find((d: any) => String(d.uid) === String(id) || String(d.id) === String(id)) || null;
      }
      const resourceId = diagram ? diagram.id : id;
      await localPersistence.deleteResource(resourceId);
      await localPersistence.clearDraft(DraftType.ERD, resourceId);
      setDiagrams(prev => prev.filter(f => String(f.id) !== String(id) && String(f.uid) !== String(id)));
      toast.success('Diagram permanently deleted from local storage');
      return;
    }

    try {
      const diagram = diagramsRef.current.find(d => String(d.id) === String(id) || String(d.uid) === String(id));
      const identifier = diagram?.uid || id;
      const res = await apiFetch(`/api/diagrams/${identifier}/permanent`, { method: 'DELETE' });
      if (res.ok) {
        setDiagrams(prev => prev.filter(f => f.id !== id));
        toast.success('Diagram permanently deleted');
      } else {
        toast.error('Failed to permanently delete diagram');
      }
    } catch (err) {
      toast.error('Error permanently deleting diagram');
    }
  };

  const moveDiagramToProject = async (diagramId: number | string, projectId: number | string | null, options?: { silent?: boolean }) => {
    const effectiveProjectId = (projectId === 'none' || projectId === 'uncategorized') ? null : projectId;

    if (isGuestCheck()) {
      const diagram = await localPersistence.getResource(diagramId);
      if (diagram) {
        diagram.project_id = effectiveProjectId;
        await localPersistence.saveResource(diagram);
        setDiagrams(prev => prev.map(f => String(f.id) === String(diagramId) || String(f.uid) === String(diagramId) ? { ...f, project_id: effectiveProjectId } : f));
        if (!options?.silent) toast.success('Diagram moved to project locally');
        return true;
      }
      return false;
    }

    try {
      const diagram = diagramsRef.current.find(d => String(d.id) === String(diagramId) || String(d.uid) === String(diagramId));
      const identifier = diagram?.uid || diagramId;
      const res = await apiFetch(`/api/diagrams/${identifier}/project`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: effectiveProjectId }),
      });
      if (res.ok) {
        setDiagrams(prev => prev.map(f => String(f.id) === String(diagramId) || String(f.uid) === String(diagramId) ? { ...f, project_id: effectiveProjectId } : f));
        if (!options?.silent) toast.success('Diagram moved to project');
        return true;
      } else {
        toast.error('Failed to move diagram');
      }
    } catch (err) {
      console.error('Error moving diagram:', err);
      toast.error('Error moving diagram');
    }
  };

  const saveDiagram = useCallback(async (nodes: Node<Entity>[], edges: Edge[], viewport: Viewport, options?: { expectedVersion?: number; retryCount?: number }) => {
    if (!activeDiagramId || (view !== 'erd' && view !== 'diagram')) return;
    
    const { expectedVersion: passedVersion, retryCount = 0 } = options || {};
    
    try {
      // Check if this is a production DB diagram
      const currentDiagram = diagramsRef.current.find(d => String(d.id) === String(activeDiagramId) || String(d.uid) === String(activeDiagramId));
      const isProductionDb = currentDiagram?.source_connection_id;
      
      let data: string;
      if (isProductionDb) {
        // Production DB: save only positions (lightweight format)
        const positions: Record<string, any> = {};
        nodes.forEach(n => {
          positions[n.id] = {
            x: n.position.x,
            y: n.position.y,
            color: (n.data as any)?.color,
            collapsed: (n.data as any)?.collapsed,
            hidden_columns: (n.data as any)?.hidden_columns,
            note: (n.data as any)?.note,
          };
        });
        data = JSON.stringify({ 
          nodes: positions, 
          viewport,
          _type: 'production_db_positions'
        });
      } else {
        // Scratch diagram: save full nodes + edges
        data = JSON.stringify({ nodes, edges, viewport });
      }
      
      const isSyncPending = !isGuestCheck();
      
      if (isGuestCheck()) {
        let diagram = await localPersistence.getResource(activeDiagramId);
        if (!diagram) {
          const allDiagrams = await localPersistence.getAllResources('erd');
          diagram = allDiagrams.find((d: any) => d.uid === activeDiagramId) || null;
        }
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
            type: RELATIONSHIP_TYPES.find(t => t.label === e.label || t.shortLabel === e.label)?.value || 'one-to-many',
            label: e.label as string,
          }));

          diagram.entities = entities;
          diagram.relationships = relationships;
          diagram.viewport_x = viewport.x;
          diagram.viewport_y = viewport.y;
          diagram.viewport_zoom = viewport.zoom;
          diagram.updated_at = new Date().toISOString();
          await localPersistence.saveResource(diagram);
        } else {
          // Resource not found — create a new one from scratch (edge case: race condition
          // where the resource was created but not yet available in IndexedDB)
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
            type: RELATIONSHIP_TYPES.find(t => t.label === e.label || t.shortLabel === e.label)?.value || 'one-to-many',
            label: e.label as string,
          }));
          const fallbackResource: any = {
            id: activeDiagramId,
            uid: activeDiagramId,
            name: 'ERD',
            project_id: null,
            is_deleted: false,
            type: 'erd',
            entities,
            relationships,
            viewport_x: viewport.x,
            viewport_y: viewport.y,
            viewport_zoom: viewport.zoom,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          await localPersistence.saveResource(fallbackResource);
        }
      }

      // 🔒 Get version for optimistic locking
      const expectedVersion = passedVersion !== undefined ? passedVersion : await getCachedDiagramVersion(activeDiagramId);

      await localPersistence.saveDraft(DraftType.ERD, activeDiagramId, data, isSyncPending);
      
      // For authenticated users, also track version for next sync
      if (!isGuestCheck() && expectedVersion !== null) {
        // Store the expected version to be sent with next sync
        try {
          const versionKey = `draft_version_${activeDiagramId}`;
          sessionStorage.setItem(versionKey, String(expectedVersion));
        } catch (e) {
          // Fail silently
        }
      }
    } catch (err) {
      console.error('Error in local saveDiagram:', err);
    }
  }, [activeDiagramId, view]);

  return {
    diagrams,
    setDiagrams,
    activeDiagramId,
    setActiveDiagramId,
    fetchDiagrams,
    createDiagram,
    updateDiagram,
    deleteDiagram,
    restoreDiagram,
    deleteDiagramPermanent,
    moveDiagramToProject,
    saveDiagram,
    hasMoreDiagrams,
    diagramsTotal,
    isLoading
  };
}
