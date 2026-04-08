import { Node, Edge } from '@xyflow/react';
import { Entity } from '../types';

export function useSQLGenerator() {
  const handleExportSQL = (
    dialect: 'postgresql' | 'mysql',
    targetFile: { name: string },
    nodes: Node<Entity>[],
    edges: Edge[]
  ) => {
    const entities: Entity[] = nodes.map(n => n.data as Entity);
    const entityMap = new Map(entities.map(e => [e.id, e]));
    let sql = `-- ERD Export: ${targetFile.name}\n-- Dialect: ${dialect}\n\n`;
    
    entities.forEach(entity => {
      sql += `CREATE TABLE ${entity.name} (\n`;
      entity.columns.forEach((col, i) => {
        const typeLower = col.type.toLowerCase();
        let resolvedType = col.type;

        if (typeLower === 'varchar') resolvedType = 'VARCHAR(255)';
        else if (typeLower === 'char') resolvedType = 'CHAR(255)';

        sql += `  ${col.name} ${resolvedType}${col.is_pk ? ' PRIMARY KEY' : ''}${col.is_nullable ? '' : ' NOT NULL'}${i === entity.columns.length - 1 ? '' : ','}\n`;
      });
      sql += `);\n\n`;
    });

    const relationshipsGenerated = new Set<string>();
    edges.forEach(edge => {
      const sourceEntity = entityMap.get(edge.source);
      const targetEntity = entityMap.get(edge.target);
      if (sourceEntity && targetEntity) {
        const sourceColId = edge.sourceHandle?.replace('col-', '').replace('-source-l', '').replace('-source', '');
        const targetColId = edge.targetHandle?.replace('col-', '').replace('-target-r', '').replace('-target', '');
        const sourceColumn = sourceEntity.columns.find(c => c.id === sourceColId);
        const targetColumn = targetEntity.columns.find(c => c.id === targetColId);
        if (sourceColumn && targetColumn) {
          const constraintName = `fk_${sourceEntity.name}_${sourceColumn.name}`.toLowerCase();
          const relKey = `${sourceEntity.name}.${sourceColumn.name}->${targetEntity.name}.${targetColumn.name}`;
          if (!relationshipsGenerated.has(relKey)) {
            sql += `ALTER TABLE ${sourceEntity.name} ADD CONSTRAINT ${constraintName} FOREIGN KEY (${sourceColumn.name}) REFERENCES ${targetEntity.name}(${targetColumn.name});\n`;
            relationshipsGenerated.add(relKey);
          }
        }
      }
    });

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
