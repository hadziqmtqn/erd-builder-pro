export enum DraftType {
  ERD = 'erd',
  NOTES = 'notes',
  FLOWCHART = 'flowchart',
  DRAWINGS = 'drawings',
}

export interface Column {
  id: string;
  name: string;
  type: string;
  is_pk: boolean;
  is_nullable: boolean;
  enum_values?: string;
  sort_order?: number;
}

export interface Entity {
  [key: string]: any;
  id: string;
  name: string;
  x: number;
  y: number;
  color: string;
  columns: Column[];
}

export interface Relationship {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  source_column_id?: string;
  target_column_id?: string;
  source_handle?: string;
  target_handle?: string;
  type: string;
  label?: string;
}

export interface Project {
  id: number | string;
  uid?: string;
  name: string;
  is_deleted: boolean;
  deleted_at?: string;
  created_at: string;
  files_count?: number;
  diagrams_count?: number;
  notes_count?: number;
  drawings_count?: number;
  flowcharts_count?: number;
}

export interface Diagram {
  id: number | string;
  uid?: string;
  name: string;
  user_id?: string; // Owner of the diagram
  project_id: number | string | null;
  projects?: Project;
  is_deleted: boolean;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
  entities: Entity[];
  relationships: Relationship[];
  viewport_x?: number;
  viewport_y?: number;
  viewport_zoom?: number;
  is_public?: boolean;
  share_token?: string;
  expiry_date?: string;
  _version?: number; // For optimistic locking - prevents race conditions
}

export interface Note {
  id: number | string;
  uid?: string;
  title: string;
  content: string;
  user_id?: string; // Owner of the note
  project_id: number | string | null;
  projects?: Project;
  is_deleted: boolean;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
  is_public?: boolean;
  share_token?: string;
  expiry_date?: string;
  _version?: number; // For optimistic locking - prevents race conditions
}

export interface Drawing {
  id: number | string;
  uid?: string;
  title: string;
  data: string;
  user_id?: string; // Owner of the drawing
  project_id: number | string | null;
  projects?: Project;
  is_deleted: boolean;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
  is_public?: boolean;
  share_token?: string;
  expiry_date?: string;
  _version?: number; // For optimistic locking - prevents race conditions
}

export interface Flowchart {
  id: number | string;
  uid?: string;
  title: string;
  data: string;
  user_id?: string; // Owner of the flowchart
  project_id: number | string | null;
  projects?: Project;
  is_deleted: boolean;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
  is_public?: boolean;
  share_token?: string;
  expiry_date?: string;
  _version?: number; // For optimistic locking - prevents race conditions
}

export interface EntityChange {
  id: number;
  entity_type: 'diagram' | 'note' | 'drawing' | 'flowchart';
  entity_id: number;
  version: number;
  user_id?: string;
  changes: Record<string, any>; // {field: old_value, field: new_value, ...}
  change_type: 'create' | 'update' | 'delete';
  created_at: string;
}
