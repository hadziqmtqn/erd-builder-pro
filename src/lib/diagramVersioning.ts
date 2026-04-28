import { Diagram, DraftType } from '../types';
import { localPersistence } from './localPersistence';

/**
 * Diagram version management for optimistic locking
 * Prevents race conditions between concurrent saves
 */

const VERSION_STORAGE_KEY = 'diagram_versions';

export interface DiagramVersion {
  diagramId: number | string;
  version: number;
  timestamp: number;
}

/**
 * Get cached version for a diagram
 */
export async function getCachedDiagramVersion(diagramId: number | string): Promise<number | null> {
  try {
    const stored = localStorage.getItem(VERSION_STORAGE_KEY);
    if (!stored) return null;
    
    const versions: DiagramVersion[] = JSON.parse(stored);
    const versionInfo = versions.find(v => String(v.diagramId) === String(diagramId));
    
    return versionInfo?.version ?? null;
  } catch (err) {
    console.warn('Failed to get cached version:', err);
    return null;
  }
}

/**
 * Update cached version after successful save
 */
export async function updateCachedDiagramVersion(
  diagramId: number | string,
  newVersion: number
): Promise<void> {
  try {
    let versions: DiagramVersion[] = [];
    const stored = localStorage.getItem(VERSION_STORAGE_KEY);
    if (stored) {
      versions = JSON.parse(stored);
    }
    
    // Remove old version for this diagram
    versions = versions.filter(v => String(v.diagramId) !== String(diagramId));
    
    // Add new version
    versions.push({
      diagramId,
      version: newVersion,
      timestamp: Date.now(),
    });
    
    // Keep only last 100 versions
    if (versions.length > 100) {
      versions = versions.slice(-100);
    }
    
    localStorage.setItem(VERSION_STORAGE_KEY, JSON.stringify(versions));
  } catch (err) {
    console.warn('Failed to update cached version:', err);
  }
}

/**
 * Clear version cache for a diagram (e.g., on conflict)
 */
export async function clearCachedDiagramVersion(diagramId: number | string): Promise<void> {
  try {
    const stored = localStorage.getItem(VERSION_STORAGE_KEY);
    if (!stored) return;
    
    let versions: DiagramVersion[] = JSON.parse(stored);
    versions = versions.filter(v => String(v.diagramId) !== String(diagramId));
    
    localStorage.setItem(VERSION_STORAGE_KEY, JSON.stringify(versions));
  } catch (err) {
    console.warn('Failed to clear cached version:', err);
  }
}

/**
 * Force refresh diagram from server and update version
 */
export async function refreshDiagramVersion(diagramId: number | string): Promise<Diagram | null> {
  try {
    const res = await fetch(`/api/diagrams/${diagramId}`);
    if (!res.ok) return null;
    
    const diagram: Diagram = await res.json();
    
    if (diagram._version !== undefined) {
      await updateCachedDiagramVersion(diagramId, diagram._version);
    }
    
    return diagram;
  } catch (err) {
    console.error('Failed to refresh diagram version:', err);
    return null;
  }
}
