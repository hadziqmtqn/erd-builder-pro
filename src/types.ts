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
  type: string;
  label?: string;
}

export interface Project {
  id: number;
  name: string;
  is_deleted: boolean;
  created_at: string;
}

export interface FileData {
  id: number;
  name: string;
  project_id: number | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  entities: Entity[];
  relationships: Relationship[];
}

export interface Note {
  id: number;
  title: string;
  content: string;
  project_id: number | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface Drawing {
  id: number;
  title: string;
  data: string;
  project_id: number | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}
