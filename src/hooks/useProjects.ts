import { useState, useCallback, useRef } from 'react';
import { Project } from '../types';

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);

  const [projectsTotal, setProjectsTotal] = useState(0);
  const [hasMoreProjects, setHasMoreProjects] = useState(false);
  const projectsRef = useRef<Project[]>(projects);

  // Keep ref in sync
  projectsRef.current = projects;

  const fetchProjects = useCallback(async (isLoadMore = false) => {
    try {
      const offset = isLoadMore ? projectsRef.current.length : 0;
      const res = await fetch(`/api/projects?limit=10&offset=${offset}`);
      if (res.ok) {
        const json = await res.json();
        const data = json.data !== undefined ? json.data : json; // Fallback to raw array
        const total = json.total !== undefined ? json.total : (Array.isArray(data) ? data.length : 0);

        const projectsList = Array.isArray(data) ? data : [];
        if (isLoadMore) {
          setProjects(prev => [...prev, ...projectsList]);
        } else {
          setProjects(projectsList);
        }
        setProjectsTotal(total);
        setHasMoreProjects((projectsList.length + offset) < total);
      }
    } catch (err) {
      console.error('Error fetching projects:', err);
    }
  }, []); // Stable dependency array

  const createProject = async (name: string) => {
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const newProject = await res.json();
        setProjects(prev => [newProject, ...prev]);
        return newProject;
      }
    } catch (err) {
      console.error('Error creating project:', err);
    }
    return null;
  };

  const updateProject = async (id: number, name: string) => {
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setProjects(prev => prev.map(p => p.id === id ? { ...p, name } : p));
      }
    } catch (err) {
      console.error('Error updating project:', err);
    }
  };

  const deleteProject = async (id: number) => {
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setProjects(prev => prev.map(p => p.id === id ? { ...p, is_deleted: true } : p));
        if (activeProjectId === id) setActiveProjectId(null);
        return true;
      }
    } catch (err) {
      console.error('Error deleting project:', err);
    }
    return false;
  };

  const restoreProject = async (id: number) => {
    try {
      const res = await fetch(`/api/projects/${id}/restore`, { method: 'POST' });
      if (res.ok) {
        setProjects(prev => prev.map(p => p.id === id ? { ...p, is_deleted: false } : p));
      }
    } catch (err) {
      console.error('Error restoring project:', err);
    }
  };

  const deleteProjectPermanent = async (id: number) => {
    try {
      await fetch(`/api/projects/${id}/permanent`, { method: 'DELETE' });
    } catch (err) {}
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
    projectsTotal
  };
}
