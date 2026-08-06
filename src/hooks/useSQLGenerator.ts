import { Node, Edge } from '@xyflow/react';
import { Entity } from '../types';
import { generateAllTablesCode } from '../lib/sql-generator-all';

export function useSQLGenerator() {
  const handleExportSQL = (
    dialect: 'postgresql' | 'mysql',
    targetFile: { name: string },
    nodes: Node<Entity>[],
    edges: Edge[]
  ) => {
    const sql = generateAllTablesCode(dialect, nodes, edges, targetFile.name);

    const blob = new Blob([sql], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${targetFile.name.toLowerCase().replace(/\s+/g, '_')}_schema.sql`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return { handleExportSQL };
}
