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
  _is_fk?: boolean;
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
  diagrams?: Diagram[];
  notes?: Note[];
  drawings?: Drawing[];
  flowcharts?: Flowchart[];
}

export interface Diagram {
  id: number | string;
  uid?: string;
  name: string;
  user_id?: string;
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
  _version?: number;
}

export interface Note {
  id: number | string;
  uid?: string;
  title: string;
  content?: string;
  user_id?: string;
  project_id: number | string | null;
  projects?: Project;
  is_deleted: boolean;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
  is_public?: boolean;
  share_token?: string;
  expiry_date?: string;
  _version?: number;
}

export interface Drawing {
  id: number | string;
  uid?: string;
  title: string;
  data?: string;
  user_id?: string;
  project_id: number | string | null;
  projects?: Project;
  is_deleted: boolean;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
  is_public?: boolean;
  share_token?: string;
  expiry_date?: string;
  _version?: number;
}

export interface Flowchart {
  id: number | string;
  uid?: string;
  title: string;
  data?: string;
  user_id?: string;
  project_id: number | string | null;
  projects?: Project;
  is_deleted: boolean;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
  is_public?: boolean;
  share_token?: string;
  expiry_date?: string;
  _version?: number;
}

export interface EntityChange {
  id: number;
  entity_type: 'diagram' | 'note' | 'drawing' | 'flowchart';
  entity_id: number;
  version: number;
  user_id?: string;
  changes: Record<string, any>;
  change_type: 'create' | 'update' | 'delete';
  created_at: string;
}

export interface AIProvider {
  id: number | string;
  name: string;
  code: string;
  base_url?: string;
  is_active: boolean;
  created_at?: string;
}

export interface AIModel {
  id: number | string;
  provider_id: number | string;
  model_identifier: string;
  display_name: string;
  context_window?: number;
  is_active: boolean;
  created_at?: string;
}

export interface UserAIConfig {
  id: number | string;
  user_id: string;
  provider_id: number | string;
  selected_model_id?: number | string;
  api_key: string;
  is_enabled: boolean;
  updated_at?: string;
}

export interface AISystemPrompt {
  id: string;
  name: string;
  content: string;
  category: 'system' | 'context' | 'format' | 'custom';
  is_default: boolean;
  is_built_in: boolean;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AIChatSession {
  id: number | string;
  uid: string;
  user_id: string;
  project_id?: number | string;
  entity_type?: string | null;
  entity_uid?: string | null;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface AIChatMessage {
  id: number | string;
  session_id: number | string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  selection_text?: string | null;
  created_at: string;
}

export type AppView = 'erd' | 'notes' | 'drawings' | 'trash' | 'flowchart' | 'changelog' | 'backups' | 'ai-settings';
