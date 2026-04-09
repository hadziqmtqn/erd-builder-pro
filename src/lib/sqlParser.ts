import { Entity, Column } from '../types';
import { Node, Edge } from '@xyflow/react';
import { COLUMN_TYPES } from './utils';

/**
 * Normalizes SQL data types to match the ERD tool's internal types.
 * Strips length information like VARCHAR(255) -> VARCHAR.
 * Handles multi-word types like BIGINT UNSIGNED.
 */
function normalizeType(typeStr: string): string {
    if (!typeStr) return 'VARCHAR';
    
    // Convert to upper case and remove length/parentheses: VARCHAR(255) -> VARCHAR
    let normalized = typeStr.split('(')[0].trim().toUpperCase();
    
    // Handle multi-word types (common in MySQL)
    // We only take the first word as the primary type but map accordingly
    if (normalized.startsWith('BIGINT')) return 'BIGINT';
    if (normalized.startsWith('TINYINT')) return 'BOOLEAN'; // Common convention
    if (normalized.startsWith('INT')) return 'INT';
    if (normalized.startsWith('CHAR')) return 'CHAR';
    if (normalized.startsWith('VARBINARY')) return 'VARBINARY';
    if (normalized.startsWith('VARCHAR')) return 'VARCHAR';

    // Alias handling
    if (normalized === 'SERIAL' || normalized === 'BIGSERIAL') return 'INT';
    if (normalized === 'INTEGER') return 'INT';
    if (normalized === 'DOUBLE PRECISION') return 'DOUBLE';
    if (normalized === 'CHARACTER VARYING') return 'VARCHAR';
    if (normalized === 'CHARACTER') return 'CHAR';
    if (normalized === 'BOOLEAN') return 'BOOLEAN';
    if (normalized === 'DATETIME') return 'TIMESTAMP';
    if (normalized === 'YEAR') return 'INT';

    // Verify against COLUMN_TYPES, default to VARCHAR if unknown
    return COLUMN_TYPES.includes(normalized) ? normalized : 'VARCHAR';
}

function cleanIdentifier(id: string): string {
    if (!id) return '';
    return id.replace(/["`[\]]/g, '').trim();
}

/**
 * Splits a code block by commas, but ignores commas inside parentheses.
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
  const cleanSql = sql
    .replace(/--.*$/gm, '') // Remove single line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
    .replace(/INSERT\s+INTO[\s\S]*?;/gi, '') // Remove Data Records
    .replace(/SET\s+\w+[\s\S]*?;/gi, '') // Remove Session/System Vars
    .replace(/LOCK\s+TABLES[\s\S]*?;/gi, '') // Remove Locks
    .replace(/UNLOCK\s+TABLES\s*;/gi, '') // Remove Unlocks
    .replace(/DROP\s+TABLE[\s\S]*?;/gi, ''); // Remove Drops

  // Find all CREATE TABLE start positions
  const tableStarts: number[] = [];
  const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?/gi;
  let match;
  while ((match = createTableRegex.exec(cleanSql)) !== null) {
    tableStarts.push(match.index);
  }

  const tableDefinitions: { name: string; body: string; tail: string }[] = [];

  for (let i = 0; i < tableStarts.length; i++) {
    const start = tableStarts[i];
    const nextStart = tableStarts[i + 1] || cleanSql.length;
    const segment = cleanSql.substring(start, nextStart);

    // Extract table name (handle schemas and backticks)
    const nameMatch = segment.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(?:["`]?(\w+)["`]?\.)?["`]?(\w+)["`]?)\s*\(/i);
    if (!nameMatch) continue;

    const tableName = cleanIdentifier(nameMatch[2]);
    const bodyStart = segment.indexOf('(');
    if (bodyStart === -1) continue;

    // Find the matching closing parenthesis for the table body
    let depth = 0;
    let bodyEnd = -1;
    for (let j = bodyStart; j < segment.length; j++) {
      if (segment[j] === '(') depth++;
      else if (segment[j] === ')') depth--;

      if (depth === 0) {
        bodyEnd = j;
        break;
      }
    }

    if (bodyEnd === -1) continue;

    const body = segment.substring(bodyStart + 1, bodyEnd);
    const tailStart = bodyEnd + 1;
    const tailEnd = segment.indexOf(';', tailStart);
    const tail = tailEnd !== -1 ? segment.substring(tailStart, tailEnd) : segment.substring(tailStart);

    tableDefinitions.push({ name: tableName, body, tail });
  }

  let xPos = 50;
  let yPos = 50;

  for (const tableDef of tableDefinitions) {
    const columns: Column[] = [];
    const tableId = `node-${Math.random().toString(36).substr(2, 9)}`;

    const lines = splitByTopLevelCommas(tableDef.body);
    
    lines.forEach(line => {
      const upperLine = line.toUpperCase().trim();
      
      // Skip table-level constraints and indexes
      if (/^(CONSTRAINT|PRIMARY\s+KEY|UNIQUE|CHECK|INDEX|KEY|FULLTEXT|SPATIAL)/i.test(upperLine)) return;

      const parts = line.trim().split(/\s+/);
      if (parts.length < 2) return;

      const colName = cleanIdentifier(parts[0]);
      
      // Robust type extraction: ignore COLLATE, CHARACTER SET, and other noise
      // We look for the first part after the name that isn't one of those keywords
      let rawType = parts[1];
      
      // If the word following the type is 'UNSIGNED' or 'ZEROFILL', we include it for better normalization
      if (parts[2] && /^(UNSIGNED|ZEROFILL)$/i.test(parts[2])) {
          rawType += ' ' + parts[2];
      }

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
        name: tableDef.name,
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

  // Extract Relationships
  // 1. ALTER TABLE ADD CONSTRAINT FOREIGN KEY
  const alterFkRegex = /ALTER\s+TABLE\s+(?:(?:["`]?(\w+)["`]?\.)?["`]?(\w+)["`]?)\s+ADD\s+(?:CONSTRAINT\s+["`]?(\w+)["`]?\s+)?FOREIGN\s+KEY\s*\(\s*["`]?(\w+)["`]?\s*\)\s+REFERENCES\s+(?:(?:["`]?(\w+)["`]?\.)?["`]?(\w+)["`]?)\s*\(\s*["`]?(\w+)["`]?\s*\)/gi;
  const alterMatches = Array.from(cleanSql.matchAll(alterFkRegex));
  for (const m of alterMatches) {
    processRel(cleanIdentifier(m[2]), cleanIdentifier(m[4]), cleanIdentifier(m[6]), cleanIdentifier(m[7]));
  }

  // 2. Inline FOREIGN KEY and column REFERENCES
  for (const tableDef of tableDefinitions) {
    const lines = splitByTopLevelCommas(tableDef.body);
    lines.forEach(line => {
        const fkMatch = line.match(/FOREIGN\s+KEY\s*\(\s*["`]?(\w+)["`]?\s*\)\s+REFERENCES\s+(?:["`]?(\w+)["`]?\.)?["`]?(\w+)["`]?\s*\(\s*["`]?(\w+)["`]?\s*\)/i);
        if (fkMatch) {
            processRel(tableDef.name, cleanIdentifier(fkMatch[1]), cleanIdentifier(fkMatch[3]), cleanIdentifier(fkMatch[4]));
        }
        
        const inlineFkMatch = line.match(/^(?:["`]?(\w+)["`]?)\s+[^,]+\s+REFERENCES\s+(?:["`]?(\w+)["`]?\.)?["`]?(\w+)["`]?\s*\(\s*["`]?(\w+)["`]?\s*\)/i);
        if (inlineFkMatch) {
            processRel(tableDef.name, cleanIdentifier(inlineFkMatch[1]), cleanIdentifier(inlineFkMatch[3]), cleanIdentifier(inlineFkMatch[4]));
        }
    });
  }

  return { nodes, edges };
}
