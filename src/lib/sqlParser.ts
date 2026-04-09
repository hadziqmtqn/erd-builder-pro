import { Entity, Column } from '../types';
import { Node, Edge } from '@xyflow/react';

export function parseSQLToERD(sql: string): { nodes: Node<Entity>[]; edges: Edge[] } {
  const nodes: Node<Entity>[] = [];
  const edges: Edge[] = [];
  
  // Normalize SQL: remove comments and extra newlines
  const cleanSql = sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  
  // Match CREATE TABLE statements
  const tableMatches = cleanSql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(?:"?(\w+)"?\.)?"?(\w+)"?)\s*\(([\s\S]*?)\);/gi);

  let xPos = 50;
  let yPos = 50;

  for (const match of tableMatches) {
    const tableName = match[2];
    const body = match[3];
    const columns: Column[] = [];
    const tableId = Math.random().toString(36).substr(2, 9);

    const lines = body.split(',').map(l => l.trim());
    
    lines.forEach(line => {
      // Skip constraints for now in basic column parsing
      if (/^(CONSTRAINT|PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|INDEX)/i.test(line)) {
        // We can handle inline FKs or constraints here later
        return;
      }

      const parts = line.split(/\s+/);
      if (parts.length < 2) return;

      const colName = parts[0].replace(/"/g, '');
      const colType = parts[1].replace(/,.*/, '').toUpperCase();
      const isPk = /PRIMARY\s+KEY/i.test(line);
      const isNullable = !/NOT\s+NULL/i.test(line);

      columns.push({
        id: Math.random().toString(36).substr(2, 9),
        name: colName,
        type: colType,
        is_pk: isPk,
        is_nullable: isNullable
      });
    });

    nodes.push({
      id: tableId,
      type: 'entity',
      position: { x: xPos, y: yPos },
      data: {
        id: tableId,
        name: tableName,
        columns,
        color: '#6366f1', // default purple
        x: xPos,
        y: yPos
      }
    });

    xPos += 350;
    if (xPos > 1200) {
      xPos = 50;
      yPos += 400;
    }
  }

  // Basic Foreign Key Detection (Matches: FOREIGN KEY (col) REFERENCES other_table(other_col))
  const fkMatches = cleanSql.matchAll(/ALTER\s+TABLE\s+(?:"?(\w+)"?\.)?"?(\w+)"?\s+ADD\s+CONSTRAINT\s+\w+\s+FOREIGN\s+KEY\s*\("?(\w+)"?\)\s+REFERENCES\s+(?:"?(\w+)"?\.)?"?(\w+)"?\s*\("?(\w+)"?\)/gi);
  
  for (const match of fkMatches) {
    const sourceTable = match[2];
    const sourceCol = match[3];
    const targetTable = match[5];
    const targetCol = match[6];

    const sourceNode = nodes.find(n => n.data.name === sourceTable);
    const targetNode = nodes.find(n => n.data.name === targetTable);

    if (sourceNode && targetNode) {
        const sourceColObj = sourceNode.data.columns.find(c => c.name === sourceCol);
        const targetColObj = targetNode.data.columns.find(c => c.name === targetCol);

        if (sourceColObj && targetColObj) {
            edges.push({
                id: `e-${sourceNode.id}-${targetNode.id}-${Math.random()}`,
                source: sourceNode.id,
                target: targetNode.id,
                sourceHandle: `col-${sourceColObj.id}-source`,
                targetHandle: `col-${targetColObj.id}-target`,
                label: '1:N',
                type: 'smoothstep',
                animated: true
            });
        }
    }
  }

  return { nodes, edges };
}
