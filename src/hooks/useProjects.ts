import { useState, useCallback } from 'react';
import { Project } from '../types';

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching projects:', err);
    }
  }, []);

  const createProject = async (name: string) => {
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const newProject = await res.json();
        setProjects(prev => [...prev, newProject]);
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
    deleteProjectPermanent
  };
}
