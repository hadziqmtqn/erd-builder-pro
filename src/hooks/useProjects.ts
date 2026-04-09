import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Project } from '../types';
import { localPersistence } from '../lib/localPersistence';

export function useProjects(isGuest: boolean = false) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<number | string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [projectsTotal, setProjectsTotal] = useState(0);
  const [hasMoreProjects, setHasMoreProjects] = useState(false);
  const projectsRef = useRef<Project[]>(projects);

  // Keep ref in sync
  projectsRef.current = projects;

  const fetchProjects = useCallback(async (isLoadMore = false, searchQuery = '') => {
    if (isGuest) {
      const localProjects = await localPersistence.getAllResources('project');
      let filtered = localProjects.filter(p => !p.is_deleted);
      if (searchQuery) filtered = filtered.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
      setProjects(filtered);
      setProjectsTotal(filtered.length);
      setHasMoreProjects(false);
      return;
    }

    setIsLoading(true);
    try {
      const offset = isLoadMore ? projectsRef.current.length : 0;
      const qParam = searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : '';
      const res = await fetch(`/api/projects?limit=10&offset=${offset}${qParam}`);
      if (res.ok) {
        const json = await res.json();
        const data = json.data !== undefined ? json.data : (Array.isArray(json) ? json : []);
        const total = json.total !== undefined ? json.total : (Array.isArray(data) ? data.length : 0);
        
        const projectsList = Array.isArray(data) ? data : [];
        if (isLoadMore) {
          setProjects(prev => [...prev, ...projectsList]);
        } else {
          setProjects(projectsList);
        }
        setProjectsTotal(total);
        setHasMoreProjects((projectsList.length + offset) < total);
      } else {
        const errText = await res.text();
        console.error(`Failed to fetch projects: ${res.status} ${res.statusText}`, errText);
      }
    } catch (err) {
      console.error('Error in fetchProjects:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isGuest]);

  const createProject = async (name: string) => {
    if (isGuest) {
      const newProject: Project = {
        id: Math.random().toString(36).substr(2, 9),
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

        setProjects(prev => prev.map(p => p.id === id ? { ...p, is_deleted: true } : p));
        if (activeProjectId === id) setActiveProjectId(null);
        toast.success('Project and its items moved to local trash');
      }
      return true;
    }

    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setProjects(prev => prev.map(p => p.id === id ? { ...p, is_deleted: true } : p));
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
      toast.success('Project permanently deleted from local');
      return;
    }
    await fetch(`/api/projects/${id}/permanent`, { method: 'DELETE' });
  };

  return {
    projects,
    setProjects,
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

