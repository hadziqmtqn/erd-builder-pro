import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Project } from '../types';
import { localPersistence } from '../lib/localPersistence';

export function useProjects(isGuest: boolean = false) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<number | string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [projectsTotal, setProjectsTotal] = useState(0);
  const [hasMoreProjects, setHasMoreProjects] = useState(false);
  const projectsRef = useRef<Project[]>(projects);

  // Keep ref in sync
  projectsRef.current = projects;

  const [uncategorized, setUncategorized] = useState<{
    diagrams: any[];
    notes: any[];
    drawings: any[];
    flowcharts: any[];
  }>({ diagrams: [], notes: [], drawings: [], flowcharts: [] });

  const fetchProjects = useCallback(async (isLoadMore = false, searchQuery = '') => {
    if (isGuest) {
      const [localProjects, uDiagrams, uNotes, uDrawings, uFlowcharts] = await Promise.all([
        localPersistence.getAllResources('project'),
        localPersistence.getAllResources('erd'),
        localPersistence.getAllResources('notes'),
        localPersistence.getAllResources('drawings'),
        localPersistence.getAllResources('flowchart'),
      ]);

      let filteredProjects = localProjects.filter(p => !p.is_deleted).map(p => ({
        ...p,
        uid: p.uid || String(p.id),
      }));
      if (searchQuery) filteredProjects = filteredProjects.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
      
      // For guest, we also need to nested the files manually or just filter them in the UI
      // To match the backend structure:
      const projectsWithFiles = filteredProjects.map(p => ({
        ...p,
        diagrams: uDiagrams.filter(f => !f.is_deleted && String(f.project_id) === String(p.id)),
        notes: uNotes.filter(f => !f.is_deleted && String(f.project_id) === String(p.id)),
        drawings: uDrawings.filter(f => !f.is_deleted && String(f.project_id) === String(p.id)),
        flowcharts: uFlowcharts.filter(f => !f.is_deleted && String(f.project_id) === String(p.id)),
      }));

      setProjects(projectsWithFiles);
      setUncategorized({
        diagrams: uDiagrams.filter(f => !f.is_deleted && !f.project_id),
        notes: uNotes.filter(f => !f.is_deleted && !f.project_id),
        drawings: uDrawings.filter(f => !f.is_deleted && !f.project_id),
        flowcharts: uFlowcharts.filter(f => !f.is_deleted && !f.project_id),
      });
      setProjectsTotal(filteredProjects.length);
      setHasMoreProjects(false);
      return;
    }

    setIsLoading(true);
    try {
      const offset = isLoadMore ? projectsRef.current.length : 0;
      const qParam = searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : '';
      const res = await fetch(`/api/projects?limit=100&offset=${offset}${qParam}`); // Increased limit for better tree view
      if (res.ok) {
        const json = await res.json();
        const projectsList = Array.isArray(json.data) ? json.data : [];
        const total = json.total !== undefined ? json.total : projectsList.length;
        
        if (isLoadMore) {
          setProjects(prev => [...prev, ...projectsList]);
        } else {
          setProjects(projectsList);
        }

        if (json.uncategorized) {
          setUncategorized(json.uncategorized);
        }

        setProjectsTotal(total);
        setHasMoreProjects((projectsList.length + offset) < total);
        return json;
      } else {
        const errText = await res.text();
        console.error(`Failed to fetch projects: ${res.status} ${res.statusText}`, errText);
      }
    } catch (err) {
      console.error('Error in fetchProjects:', err);
    } finally {
      setIsLoading(false);
    }
    return null;
  }, [isGuest]);

  const createProject = async (name: string) => {
    if (isGuest) {
      const newProject: Project = {
        id: Math.random().toString(36).substr(2, 9),
        uid: crypto.randomUUID(),
        name,
        is_deleted: false,
        created_at: new Date().toISOString(),
      };
      // @ts-ignore
      newProject.type = 'project';
      await localPersistence.saveResource(newProject);
      setProjects(prev => [newProject, ...prev]);
      toast.success('Project created locally');
      return newProject;
    }

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const newProject = await res.json();
        setProjects(prev => [newProject, ...prev]);
        toast.success('Project created successfully');
        return newProject;
      }
    } catch (err) {}
    return null;
  };

  const updateProject = async (id: number | string, name: string) => {
    if (isGuest) {
      const project = await localPersistence.getResource(id);
      if (project) {
        project.name = name;
        await localPersistence.saveResource(project);
        setProjects(prev => prev.map(p => p.id === id ? { ...p, name } : p));
        toast.success('Project renamed locally');
      }
      return;
    }

    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setProjects(prev => prev.map(p => p.id === id ? { ...p, name } : p));
        toast.success('Project renamed successfully');
      }
    } catch (err) {}
  };

  const deleteProject = async (id: number | string) => {
    if (isGuest) {
      const project = await localPersistence.getResource(id);
      if (project) {
        const deleted_at = new Date().toISOString();
        project.is_deleted = true;
        project.deleted_at = deleted_at;
        await localPersistence.saveResource(project);
        
        // Cascading soft delete for local resources
        const types = ['erd', 'notes', 'drawings', 'flowchart'];
        for (const type of types) {
          const items = await localPersistence.getAllResources(type);
          const projectItems = items.filter(item => String(item.project_id) === String(id));
          for (const item of projectItems) {
            item.is_deleted = true;
            item.deleted_at = deleted_at;
            await localPersistence.saveResource(item);
          }
        }

        setProjects(prev => prev.filter(p => p.id !== id));
        if (activeProjectId === id) setActiveProjectId(null);
        toast.success('Project and its items moved to local trash');
      }
      return true;
    }

    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setProjects(prev => prev.filter(p => p.id !== id));
        if (activeProjectId === id) setActiveProjectId(null);
        toast.success('Project moved to trash');
        return true;
      }
    } catch (err) {}
    return false;
  };

  const restoreProject = async (id: number | string) => {
    if (isGuest) {
      const project = await localPersistence.getResource(id);
      if (project) {
        project.is_deleted = false;
        project.deleted_at = undefined;
        await localPersistence.saveResource(project);

        // Cascading restore for local resources
        const types = ['erd', 'notes', 'drawings', 'flowchart'];
        for (const type of types) {
          const items = await localPersistence.getAllResources(type);
          const projectItems = items.filter(item => String(item.project_id) === String(id));
          for (const item of projectItems) {
            item.is_deleted = false;
            item.deleted_at = undefined;
            await localPersistence.saveResource(item);
          }
        }

        fetchProjects();
        toast.success('Project and its items restored locally');
      }
      return;
    }
    await fetch(`/api/projects/${id}/restore`, { method: 'POST' });
    fetchProjects();
  };

  const deleteProjectPermanent = async (id: number | string) => {
    if (isGuest) {
      await localPersistence.deleteResource(id);
      setProjects(prev => prev.filter(p => p.id !== id));
      toast.success('Project permanently deleted from local');
      return;
    }
    await fetch(`/api/projects/${id}/permanent`, { method: 'DELETE' });
    setProjects(prev => prev.filter(p => p.id !== id));
  };

  return {
    projects,
    setProjects,
    uncategorized,
    setUncategorized,
    activeProjectId,
    setActiveProjectId,
    fetchProjects,
    createProject,
    updateProject,
    deleteProject,
    restoreProject,
    deleteProjectPermanent,
    hasMoreProjects,
    projectsTotal,
    isLoading
  };
}

