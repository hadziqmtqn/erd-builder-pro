import { Node, Edge } from '@xyflow/react';
import { Entity } from '../types';
import { supportsNumericPrecision } from '../lib/column-metadata';

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

        if (typeLower === 'varchar') resolvedType = `VARCHAR(${col.max_length || 255})`;
        else if (typeLower === 'char') resolvedType = `CHAR(${col.max_length || 255})`;
        else if (supportsNumericPrecision(typeLower)) resolvedType = `DECIMAL(${col.numeric_precision || 10},${col.numeric_scale ?? 2})`;
        else if (typeLower === 'longtext' && dialect === 'postgresql') resolvedType = 'TEXT';

        const comment = col.comment && dialect === 'mysql' ? ` COMMENT '${col.comment.replace(/'/g, "''")}'` : '';
        sql += `  ${col.name} ${resolvedType}${col.is_pk ? ' PRIMARY KEY' : ''}${col.is_nullable ? '' : ' NOT NULL'}${comment}${i === entity.columns.length - 1 ? '' : ','}\n`;
      });
      sql += `);\n\n`;
      if (dialect === 'postgresql') {
        for (const col of entity.columns) {
          if (col.comment) sql += `COMMENT ON COLUMN ${entity.name}.${col.name} IS '${col.comment.replace(/'/g, "''")}';\n`;
        }
        if (entity.columns.some(col => col.comment)) sql += '\n';
      }
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
