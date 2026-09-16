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
  default_value?: string | null;
  is_unique?: boolean;
  _is_fk?: boolean;
  enum_values?: string;
  enum_name?: string;
  comment?: string;
  max_length?: number | null;
  numeric_precision?: number | null;
  numeric_scale?: number | null;
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
  comment?: string | null;
  constraints?: TableConstraint[];
  indexes?: TableIndex[];
}

export interface TableConstraint {
  id: string;
  entity_id: string;
  kind: 'primary_key' | 'unique' | 'check';
  name?: string | null;
  column_ids?: string[];
  expression?: string | null;
}

export interface TableIndex {
  id: string;
  entity_id: string;
  name: string;
  column_ids: string[];
  is_unique?: boolean;
  algorithm?: string | null;
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
  on_delete?: string | null;
  on_update?: string | null;
  constraint_name?: string | null;
  data?: Record<string, any>;
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
  user_id?: string | null;
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
  source_type?: string;
  source_connection_id?: number;
  dbml_source?: string;
  dbmlSource?: string;
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
  entity_type: 'diagrams' | 'notes' | 'drawings' | 'flowcharts';
  entity_id: string;
  version: number;
  user_id?: string;
  changes: Record<string, any>;
  change_type: 'create' | 'update' | 'delete' | 'restore' | 'pre_restore';
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
  client_message_id?: string | null;
  delivery_status?: 'pending' | 'needs-resume' | 'pending-assistant';
  plan_mode?: boolean;
  created_at: string;
}

export type AppView = 'erd' | 'notes' | 'drawings' | 'trash' | 'flowchart' | 'changelog' | 'backups' | 'ai-settings';
