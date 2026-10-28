import { Database, DatabaseZap, FileText, Network, PenTool, type LucideIcon } from 'lucide-react';

export type FileTypeKey = 'notes' | 'erd' | 'flowchart' | 'db-client' | 'drawings';

export interface FileTypeConfig {
  value: FileTypeKey;
  label: string;
  icon: LucideIcon;
  /** Cloud plan capability; DB Client is Desktop/CLI only. */
  capability: 'notes' | 'erd_builder' | 'flowcharts' | 'desktop_only' | 'drawings';
}

/** Order of the Project tabs and the New file cards (COL-008). */
export const FILE_TYPES: FileTypeConfig[] = [
  { value: 'notes', label: 'Notes', icon: FileText, capability: 'notes' },
  { value: 'erd', label: 'ERD Builder', icon: Database, capability: 'erd_builder' },
  { value: 'flowchart', label: 'Flowchart', icon: Network, capability: 'flowcharts' },
  { value: 'db-client', label: 'DB Client', icon: DatabaseZap, capability: 'desktop_only' },
  { value: 'drawings', label: 'Drawings', icon: PenTool, capability: 'drawings' },
];

/** Locks a feature only inside a Cloud Team whose plan does not include it; the backend still enforces it. */
export function cloudFeatureLock(
  user: any,
  activeTeam: { capabilities?: Record<string, boolean> } | null | undefined,
  activeTeamId: string | null,
  teamsAvailable: boolean,
) {
  const capabilities = user?.isSso && activeTeamId && teamsAvailable ? activeTeam?.capabilities || {} : null;
  return (capability: string) => capabilities !== null && capabilities[capability] !== true;
}

export function openCloudPricing(ssoPortalUrl?: string | null) {
  if (!ssoPortalUrl) return;
  try {
    window.location.assign(new URL('/pricing#cloud-saas', ssoPortalUrl).toString());
  } catch {
    // Ignore malformed deployment configuration.
  }
}

/** `?workspace=` value of the virtual Project that lists files without a Project. */
export const UNASSIGNED_PROJECT = 'unassigned';
