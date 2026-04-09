import { Entity, Column } from '../types';
import { Node, Edge } from '@xyflow/react';
import { COLUMN_TYPES } from './utils';

/**
 * Normalizes SQL data types to match the ERD tool's internal types.
 * Strips length information like VARCHAR(255) -> VARCHAR.
 */
function normalizeType(typeStr: string): string {
    if (!typeStr) return 'VARCHAR';
    
    // Remove length/parentheses: VARCHAR(255) -> VARCHAR
    let normalized = typeStr.split('(')[0].trim().toUpperCase();
    
    // Alias handling
    if (normalized === 'SERIAL' || normalized === 'BIGSERIAL') return 'INT';
    if (normalized === 'INTEGER') return 'INT';
    if (normalized === 'DOUBLE PRECISION') return 'DOUBLE';
    if (normalized === 'CHARACTER VARYING') return 'VARCHAR';
    if (normalized === 'CHARACTER') return 'CHAR';
    if (normalized === 'BOOLEAN') return 'BOOLEAN';
    if (normalized === 'DATETIME') return 'TIMESTAMP';

    // Verify against COLUMN_TYPES, default to VARCHAR if unknown
    return COLUMN_TYPES.includes(normalized) ? normalized : 'VARCHAR';
}

function cleanIdentifier(id: string): string {
    if (!id) return '';
    return id.replace(/["`[\]]/g, '').trim();
}

/**
 * Splits a table body by commas, but ignores commas inside parentheses.
 * e.g. "id INT, price DECIMAL(10,2)" -> ["id INT", "price DECIMAL(10,2)"]
 */
function splitByTopLevelCommas(str: string): string[] {
    const result: string[] = [];
    let current = '';
    let depth = 0;
    
    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        if (char === '(') depth++;
        else if (char === ')') depth--;
        
        if (char === ',' && depth === 0) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    if (current.trim()) result.push(current.trim());
    return result;
}

export function parseSQLToERD(sql: string): { nodes: Node<Entity>[]; edges: Edge[] } {
  const nodes: Node<Entity>[] = [];
  const edges: Edge[] = [];
  
  // Normalize SQL: remove comments and handle line breaks
  // Also strip common data records and noise statements found in dumps
  const cleanSql = sql
    .replace(/--.*$/gm, '') // Remove single line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
    .replace(/INSERT\s+INTO[\s\S]*?;/gi, '') // Remove Data Records
    .replace(/SET\s+\w+[\s\S]*?;/gi, '') // Remove Session/System Vars
    .replace(/LOCK\s+TABLES[\s\S]*?;/gi, '') // Remove Locks
    .replace(/UNLOCK\s+TABLES\s*;/gi, '') // Remove Unlocks
    .replace(/DROP\s+TABLE[\s\S]*?;/gi, ''); // Remove Drops

  // Match CREATE TABLE statements (PostgreSQL/MySQL/General)
  // Support: CREATE TABLE [IF NOT EXISTS] [schema.]table ( ... ) [METADATA];
  // The ([^;]*) handles metadata like ENGINE=InnoDB after the body
  const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(?:["`]?(\w+)["`]?\.)?["`]?(\w+)["`]?)\s*\(([\s\S]*?)\)([^;]*);/gi;
  const tableMatches = Array.from(cleanSql.matchAll(tableRegex));

  let xPos = 50;
  let yPos = 50;

  for (const match of tableMatches) {
    const tableName = cleanIdentifier(match[2]);
    const body = match[3];
    const columns: Column[] = [];
    const tableId = `node-${Math.random().toString(36).substr(2, 9)}`;

    const lines = splitByTopLevelCommas(body);
    
    lines.forEach(line => {
      const upperLine = line.toUpperCase();
      
      // Handle table-level constraints in the body
      // FOREIGN KEY (col) REFERENCES other(other_col)
      const fkMatch = line.match(/FOREIGN\s+KEY\s*\(\s*["`]?(\w+)["`]?\s*\)\s+REFERENCES\s+(?:["`]?(\w+)["`]?\.)?["`]?(\w+)["`]?\s*\(\s*["`]?(\w+)["`]?\s*\)/i);
      if (fkMatch) {
          // We'll process relationships in a second pass to ensure all nodes exist
          return;
      }

      // Skip other table-level constraints for now
      if (/^(CONSTRAINT|PRIMARY\s+KEY|UNIQUE|CHECK|INDEX)/i.test(line)) return;

      const parts = line.split(/\s+/);
      if (parts.length < 2) return;

      const colName = cleanIdentifier(parts[0]);
      const rawType = parts[1];
      const colType = normalizeType(rawType);
      
      const isPk = upperLine.includes('PRIMARY KEY');
      const isNullable = !upperLine.includes('NOT NULL');

      columns.push({
        id: `col-${Math.random().toString(36).substr(2, 9)}`,
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
        color: '#6366f1',
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

  // Second Pass: Find Relationships
  // 1. ALTER TABLE ADD CONSTRAINT FOREIGN KEY
  const alterFkRegex = /ALTER\s+TABLE\s+(?:(?:["`]?(\w+)["`]?\.)?["`]?(\w+)["`]?)\s+ADD\s+(?:CONSTRAINT\s+["`]?(\w+)["`]?\s+)?FOREIGN\s+KEY\s*\(\s*["`]?(\w+)["`]?\s*\)\s+REFERENCES\s+(?:(?:["`]?(\w+)["`]?\.)?["`]?(\w+)["`]?)\s*\(\s*["`]?(\w+)["`]?\s*\)/gi;
  const alterMatches = Array.from(cleanSql.matchAll(alterFkRegex));

  const processRel = (sourceTable: string, sourceCol: string, targetTable: string, targetCol: string) => {
    const sNode = nodes.find(n => n.data.name.toLowerCase() === sourceTable.toLowerCase());
    const tNode = nodes.find(n => n.data.name.toLowerCase() === targetTable.toLowerCase());

    if (sNode && tNode) {
        const sCol = sNode.data.columns.find(c => c.name.toLowerCase() === sourceCol.toLowerCase());
        const tCol = tNode.data.columns.find(c => c.name.toLowerCase() === targetCol.toLowerCase());

        if (sCol && tCol) {
            edges.push({
                id: `e-${sNode.id}-${tNode.id}-${Math.random()}`,
                source: sNode.id,
                target: tNode.id,
                sourceHandle: `col-${sCol.id}-source`,
                targetHandle: `col-${tCol.id}-target`,
                label: '1:N',
                type: 'smoothstep',
                animated: true
            });
        }
    }
  };

  for (const m of alterMatches) {
    processRel(cleanIdentifier(m[2]), cleanIdentifier(m[4]), cleanIdentifier(m[6]), cleanIdentifier(m[7]));
  }

  // 2. Inline FOREIGN KEY in CREATE TABLE body
  for (const match of tableMatches) {
    const parentTableName = cleanIdentifier(match[2]);
    const body = match[3];
    const lines = splitByTopLevelCommas(body);
    
    lines.forEach(line => {
        // Handle standalone FOREIGN KEY line
        const fkMatch = line.match(/FOREIGN\s+KEY\s*\(\s*["`]?(\w+)["`]?\s*\)\s+REFERENCES\s+(?:["`]?(\w+)["`]?\.)?["`]?(\w+)["`]?\s*\(\s*["`]?(\w+)["`]?\s*\)/i);
        if (fkMatch) {
            processRel(parentTableName, cleanIdentifier(fkMatch[1]), cleanIdentifier(fkMatch[3]), cleanIdentifier(fkMatch[4]));
        }
        
        // Handle inline REFERENCES on a column line
        const inlineFkMatch = line.match(/^(?:["`]?(\w+)["`]?)\s+[^,]+\s+REFERENCES\s+(?:["`]?(\w+)["`]?\.)?["`]?(\w+)["`]?\s*\(\s*["`]?(\w+)["`]?\s*\)/i);
        if (inlineFkMatch) {
            processRel(parentTableName, cleanIdentifier(inlineFkMatch[1]), cleanIdentifier(inlineFkMatch[3]), cleanIdentifier(inlineFkMatch[4]));
        }
    });
  }

  return { nodes, edges };
}
