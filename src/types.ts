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

export interface FileData {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
  entities: Entity[];
  relationships: Relationship[];
}
