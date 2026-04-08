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
}

export interface FileData {
  id: number | string;
  uid?: string;
  name: string;
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
}

export interface Note {
  id: number | string;
  uid?: string;
  title: string;
  content: string;
  project_id: number | string | null;
  projects?: Project;
  is_deleted: boolean;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
  is_public?: boolean;
  share_token?: string;
  expiry_date?: string;
}

export interface Drawing {
  id: number | string;
  uid?: string;
  title: string;
  data: string;
  project_id: number | string | null;
  projects?: Project;
  is_deleted: boolean;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
  is_public?: boolean;
  share_token?: string;
  expiry_date?: string;
}

export interface Flowchart {
  id: number | string;
  uid?: string;
  title: string;
  data: string;
  project_id: number | string | null;
  projects?: Project;
  is_deleted: boolean;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
  is_public?: boolean;
  share_token?: string;
  expiry_date?: string;
}
