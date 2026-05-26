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

// ─── SQL LEXER & TOKENIZER ────────────────────────────────

const KEYWORDS = new Set([
  'CREATE', 'TABLE', 'IF', 'NOT', 'EXISTS',
  'ALTER', 'ADD', 'COLUMN', 'CONSTRAINT',
  'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES',
  'UNIQUE', 'CHECK', 'INDEX', 'DEFAULT', 'NULL',
  'ON', 'UPDATE', 'DELETE', 'CASCADE', 'RESTRICT',
  'SET', 'NO', 'ACTION', 'AUTO_INCREMENT', 'SERIAL', 'BIGSERIAL', 'COLLATE',
  'UNSIGNED', 'ZEROFILL'
]);

type TokenType = 'KEYWORD' | 'IDENTIFIER' | 'SYMBOL' | 'NUMBER' | 'STRING';

interface Token {
  type: TokenType;
  value: string;
}

class SqlLexer {
  private input: string;
  private pos: number = 0;

  constructor(input: string) {
    // Strip comments: single line (--, #) and multi-line (/* */)
    this.input = input
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/#.*$/gm, '');
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];
    while (this.pos < this.input.length) {
      const char = this.input[this.pos];

      // Whitespace
      if (/\s/.test(char)) {
        this.pos++;
        continue;
      }

      // Symbols
      if (char === '(' || char === ')' || char === ',' || char === ';' || char === '.') {
        tokens.push({ type: 'SYMBOL', value: char });
        this.pos++;
        continue;
      }

      // Quoted Identifiers
      if (char === '"' || char === '`') {
        const quote = char;
        let value = '';
        this.pos++;
        while (this.pos < this.input.length && this.input[this.pos] !== quote) {
          if (this.input[this.pos] === '\\' && this.input[this.pos + 1] === quote) {
            value += quote;
            this.pos += 2;
          } else {
            value += this.input[this.pos];
            this.pos++;
          }
        }
        if (this.pos < this.input.length) this.pos++;
        tokens.push({ type: 'IDENTIFIER', value });
        continue;
      }

      // Braced Identifiers (SQL Server)
      if (char === '[') {
        let value = '';
        this.pos++;
        while (this.pos < this.input.length && this.input[this.pos] !== ']') {
          value += this.input[this.pos];
          this.pos++;
        }
        if (this.pos < this.input.length) this.pos++;
        tokens.push({ type: 'IDENTIFIER', value });
        continue;
      }

      // String Literals
      if (char === "'") {
        let value = '';
        this.pos++;
        while (this.pos < this.input.length && this.input[this.pos] !== "'") {
          if (this.input[this.pos] === '\\' && this.input[this.pos + 1] === "'") {
            value += "'";
            this.pos += 2;
          } else if (this.input[this.pos] === "'" && this.input[this.pos + 1] === "'") {
            value += "'";
            this.pos += 2;
          } else {
            value += this.input[this.pos];
            this.pos++;
          }
        }
        if (this.pos < this.input.length) this.pos++;
        tokens.push({ type: 'STRING', value });
        continue;
      }

      // Numbers
      if (/[0-9]/.test(char)) {
        let value = '';
        while (this.pos < this.input.length && /[0-9.]/.test(this.input[this.pos])) {
          value += this.input[this.pos];
          this.pos++;
        }
        tokens.push({ type: 'NUMBER', value });
        continue;
      }

      // Words (Identifiers or Keywords)
      if (/[a-zA-Z_]/.test(char)) {
        let value = '';
        while (this.pos < this.input.length && /[a-zA-Z0-9_$]/.test(this.input[this.pos])) {
          value += this.input[this.pos];
          this.pos++;
        }
        const upper = value.toUpperCase();
        if (KEYWORDS.has(upper)) {
          tokens.push({ type: 'KEYWORD', value: upper });
        } else {
          tokens.push({ type: 'IDENTIFIER', value });
        }
        continue;
      }

      // Operator or other unknown character
      tokens.push({ type: 'SYMBOL', value: char });
      this.pos++;
    }
    return tokens;
  }
}

class TokenStream {
  private tokens: Token[];
  private idx: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  peek(offset: number = 0): Token | null {
    if (this.idx + offset >= this.tokens.length) return null;
    return this.tokens[this.idx + offset];
  }

  next(): Token | null {
    if (this.idx >= this.tokens.length) return null;
    return this.tokens[this.idx++];
  }

  matchKeyword(keyword: string): boolean {
    const t = this.peek();
    return t !== null && t.type === 'KEYWORD' && t.value === keyword;
  }

  consumeKeyword(keyword: string): boolean {
    if (this.matchKeyword(keyword)) {
      this.next();
      return true;
    }
    return false;
  }

  matchSymbol(symbol: string): boolean {
    const t = this.peek();
    return t !== null && t.type === 'SYMBOL' && t.value === symbol;
  }

  consumeSymbol(symbol: string): boolean {
    if (this.matchSymbol(symbol)) {
      this.next();
      return true;
    }
    return false;
  }

  eof(): boolean {
    return this.idx >= this.tokens.length;
  }
}

// ─── PARSER HELPER FUNCTIONS ──────────────────────────────

function parseTableName(stream: TokenStream): string {
  let name = '';
  const t1 = stream.next();
  if (t1 && (t1.type === 'IDENTIFIER' || t1.type === 'KEYWORD')) {
    name = t1.value;
  }
  if (stream.consumeSymbol('.')) {
    const t2 = stream.next();
    if (t2 && (t2.type === 'IDENTIFIER' || t2.type === 'KEYWORD')) {
      name = t2.value;
    }
  }
  return cleanIdentifier(name);
}

function parseDataType(stream: TokenStream): string {
  const t = stream.next();
  if (!t) return 'VARCHAR';
  let typeName = t.value;

  if (stream.consumeSymbol('(')) {
    let depth = 1;
    let paramsStr = '';
    while (!stream.eof()) {
      const p = stream.next();
      if (!p) break;
      if (p.type === 'SYMBOL' && p.value === '(') {
        depth++;
      } else if (p.type === 'SYMBOL' && p.value === ')') {
        depth--;
        if (depth === 0) break;
      }
      if (p.type === 'STRING') {
        paramsStr += `'${p.value}'`;
      } else {
        paramsStr += p.value;
      }
    }
    typeName += `(${paramsStr})`;
  }

  while (!stream.eof()) {
    const nextT = stream.peek();
    if (nextT && nextT.type === 'KEYWORD' && (nextT.value === 'UNSIGNED' || nextT.value === 'ZEROFILL')) {
      typeName += ' ' + nextT.value;
      stream.next();
    } else {
      break;
    }
  }

  return typeName;
}

interface InlineColumnConstraints {
  isPk: boolean;
  isNullable: boolean;
  refTable?: string;
  refColumn?: string;
}

function parseColumnConstraints(stream: TokenStream): InlineColumnConstraints {
  let isPk = false;
  let isNullable = true;
  let refTable: string | undefined;
  let refColumn: string | undefined;

  while (!stream.eof()) {
    const t = stream.peek();
    if (!t) break;

    if (t.type === 'SYMBOL' && (t.value === ',' || t.value === ')' || t.value === ';')) {
      break;
    }

    if (stream.consumeKeyword('PRIMARY')) {
      stream.consumeKeyword('KEY');
      isPk = true;
      isNullable = false;
      continue;
    }

    if (stream.consumeKeyword('NOT')) {
      if (stream.consumeKeyword('NULL')) {
        isNullable = false;
      }
      continue;
    }

    if (stream.consumeKeyword('NULL')) {
      isNullable = true;
      continue;
    }

    if (stream.consumeKeyword('REFERENCES')) {
      refTable = parseTableName(stream);
      if (stream.consumeSymbol('(')) {
        const colToken = stream.next();
        if (colToken) {
          refColumn = colToken.value;
        }
        stream.consumeSymbol(')');
      }
      continue;
    }

    if (stream.consumeKeyword('DEFAULT')) {
      const nextT = stream.peek();
      if (nextT && nextT.type === 'SYMBOL' && nextT.value === '(') {
        let depth = 0;
        while (!stream.eof()) {
          const skipT = stream.next();
          if (!skipT) break;
          if (skipT.type === 'SYMBOL' && skipT.value === '(') depth++;
          else if (skipT.type === 'SYMBOL' && skipT.value === ')') {
            depth--;
            if (depth === 0) break;
          }
        }
      } else {
        stream.next();
      }
      continue;
    }

    if (stream.consumeKeyword('COLLATE')) {
      stream.next();
      continue;
    }

    stream.next();
  }

  return { isPk, isNullable, refTable, refColumn };
}

interface ParsedColumn {
  name: string;
  type: string;
  is_pk: boolean;
  is_nullable: boolean;
  enum_values?: string;
}

interface ParsedTableConstraint {
  type: 'PRIMARY_KEY' | 'FOREIGN_KEY';
  columns: string[];
  refTable?: string;
  refColumns?: string[];
}

interface ParsedTable {
  name: string;
  columns: ParsedColumn[];
  constraints: ParsedTableConstraint[];
}

function parseTableItems(stream: TokenStream, table: ParsedTable) {
  if (!stream.consumeSymbol('(')) return;

  while (!stream.eof()) {
    if (stream.matchSymbol(')')) {
      stream.next();
      break;
    }

    if (stream.consumeKeyword('CONSTRAINT')) {
      const nameToken = stream.next();
      // Skip the constraint name identifier
    }

    if (stream.consumeKeyword('PRIMARY')) {
      stream.consumeKeyword('KEY');
      if (stream.consumeSymbol('(')) {
        const columns: string[] = [];
        while (!stream.eof() && !stream.matchSymbol(')')) {
          const colToken = stream.next();
          if (colToken && (colToken.type === 'IDENTIFIER' || colToken.type === 'KEYWORD')) {
            columns.push(colToken.value);
          }
          stream.consumeSymbol(',');
        }
        stream.consumeSymbol(')');
        table.constraints.push({ type: 'PRIMARY_KEY', columns });
      }
    } else if (stream.consumeKeyword('FOREIGN')) {
      stream.consumeKeyword('KEY');
      if (stream.consumeSymbol('(')) {
        const columns: string[] = [];
        while (!stream.eof() && !stream.matchSymbol(')')) {
          const colToken = stream.next();
          if (colToken && (colToken.type === 'IDENTIFIER' || colToken.type === 'KEYWORD')) {
            columns.push(colToken.value);
          }
          stream.consumeSymbol(',');
        }
        stream.consumeSymbol(')');

        if (stream.consumeKeyword('REFERENCES')) {
          const refTable = parseTableName(stream);
          const refColumns: string[] = [];
          if (stream.consumeSymbol('(')) {
            while (!stream.eof() && !stream.matchSymbol(')')) {
              const colToken = stream.next();
              if (colToken && (colToken.type === 'IDENTIFIER' || colToken.type === 'KEYWORD')) {
                refColumns.push(colToken.value);
              }
              stream.consumeSymbol(',');
            }
            stream.consumeSymbol(')');
          }
          table.constraints.push({ type: 'FOREIGN_KEY', columns, refTable, refColumns });
        }
      }
    } else if (
      stream.consumeKeyword('UNIQUE') ||
      stream.consumeKeyword('CHECK') ||
      stream.consumeKeyword('KEY') ||
      stream.consumeKeyword('INDEX')
    ) {
      let depth = 0;
      while (!stream.eof()) {
        const nextT = stream.peek();
        if (!nextT) break;
        if (nextT.type === 'SYMBOL' && nextT.value === ',' && depth === 0) {
          break;
        }
        if (nextT.type === 'SYMBOL' && nextT.value === ')' && depth === 0) {
          break;
        }
        if (nextT.type === 'SYMBOL' && nextT.value === '(') depth++;
        else if (nextT.type === 'SYMBOL' && nextT.value === ')') depth--;
        stream.next();
      }
    } else {
      const colNameToken = stream.next();
      if (colNameToken && (colNameToken.type === 'IDENTIFIER' || colNameToken.type === 'KEYWORD')) {
        const colName = cleanIdentifier(colNameToken.value);
        const colType = parseDataType(stream);
        const { isPk, isNullable, refTable, refColumn } = parseColumnConstraints(stream);

        let enumValues = '';
        if (colType.toUpperCase().startsWith('ENUM')) {
          const enumMatch = colType.match(/ENUM\s*\(([^)]+)\)/i);
          if (enumMatch) {
            enumValues = enumMatch[1]
              .split(',')
              .map(v => v.trim().replace(/^['"]|['"]$/g, ''))
              .join(', ');
          }
        }

        table.columns.push({
          name: colName,
          type: colType,
          is_pk: isPk,
          is_nullable: isNullable,
          enum_values: enumValues,
        });

        if (refTable && refColumn) {
          table.constraints.push({
            type: 'FOREIGN_KEY',
            columns: [colName],
            refTable,
            refColumns: [refColumn],
          });
        }
      }
    }

    if (stream.consumeSymbol(',')) {
      continue;
    } else if (stream.matchSymbol(')')) {
      stream.next();
      break;
    } else {
      while (!stream.eof()) {
        const nextT = stream.peek();
        if (!nextT) break;
        if (nextT.type === 'SYMBOL' && (nextT.value === ',' || nextT.value === ')')) {
          break;
        }
        stream.next();
      }
      stream.consumeSymbol(',');
    }
  }
}

export interface ParsedSchema {
  tables: ParsedTable[];
  alterFks: {
    sourceTable: string;
    sourceCols: string[];
    targetTable: string;
    targetCols: string[];
  }[];
  alterAddColumns: {
    tableName: string;
    columns: ParsedColumn[];
  }[];
}

export function parseSqlDdl(sql: string): ParsedSchema {
  const lexer = new SqlLexer(sql);
  const tokens = lexer.tokenize();
  const stream = new TokenStream(tokens);

  const tables: ParsedTable[] = [];
  const alterFks: ParsedSchema['alterFks'] = [];
  const alterAddColumns: ParsedSchema['alterAddColumns'] = [];

  while (!stream.eof()) {
    if (stream.consumeKeyword('CREATE')) {
      if (stream.consumeKeyword('TABLE')) {
        if (stream.consumeKeyword('IF')) {
          stream.consumeKeyword('NOT');
          stream.consumeKeyword('EXISTS');
        }

        const tableName = parseTableName(stream);
        if (tableName) {
          const table: ParsedTable = {
            name: tableName,
            columns: [],
            constraints: [],
          };
          parseTableItems(stream, table);
          tables.push(table);
        }
      }
    } else if (stream.consumeKeyword('ALTER')) {
      if (stream.consumeKeyword('TABLE')) {
        const tableName = parseTableName(stream);
        if (tableName) {
          while (!stream.eof()) {
            if (stream.consumeSymbol(';')) {
              break;
            }

            if (stream.consumeKeyword('ADD')) {
              if (stream.consumeKeyword('CONSTRAINT')) {
                const nameToken = stream.next();
              }

              if (stream.consumeKeyword('FOREIGN')) {
                stream.consumeKeyword('KEY');
                if (stream.consumeSymbol('(')) {
                  const sourceCols: string[] = [];
                  while (!stream.eof() && !stream.matchSymbol(')')) {
                    const colToken = stream.next();
                    if (colToken && (colToken.type === 'IDENTIFIER' || colToken.type === 'KEYWORD')) {
                      sourceCols.push(colToken.value);
                    }
                    stream.consumeSymbol(',');
                  }
                  stream.consumeSymbol(')');

                  if (stream.consumeKeyword('REFERENCES')) {
                    const targetTable = parseTableName(stream);
                    const targetCols: string[] = [];
                    if (stream.consumeSymbol('(')) {
                      while (!stream.eof() && !stream.matchSymbol(')')) {
                        const colToken = stream.next();
                        if (colToken && (colToken.type === 'IDENTIFIER' || colToken.type === 'KEYWORD')) {
                          targetCols.push(colToken.value);
                        }
                        stream.consumeSymbol(',');
                      }
                      stream.consumeSymbol(')');
                    }
                    alterFks.push({
                      sourceTable: tableName,
                      sourceCols,
                      targetTable,
                      targetCols,
                    });
                  }
                }
              } else {
                stream.consumeKeyword('COLUMN');
                const colNameToken = stream.next();
                if (colNameToken && (colNameToken.type === 'IDENTIFIER' || colNameToken.type === 'KEYWORD')) {
                  const colName = cleanIdentifier(colNameToken.value);
                  const colType = parseDataType(stream);
                  const { isPk, isNullable, refTable, refColumn } = parseColumnConstraints(stream);

                  let enumValues = '';
                  if (colType.toUpperCase().startsWith('ENUM')) {
                    const enumMatch = colType.match(/ENUM\s*\(([^)]+)\)/i);
                    if (enumMatch) {
                      enumValues = enumMatch[1]
                        .split(',')
                        .map(v => v.trim().replace(/^['"]|['"]$/g, ''))
                        .join(', ');
                    }
                  }

                  const newCol: ParsedColumn = {
                    name: colName,
                    type: colType,
                    is_pk: isPk,
                    is_nullable: isNullable,
                    enum_values: enumValues,
                  };

                  let existingAlter = alterAddColumns.find(
                    a => a.tableName.toLowerCase() === tableName.toLowerCase()
                  );
                  if (!existingAlter) {
                    existingAlter = { tableName, columns: [] };
                    alterAddColumns.push(existingAlter);
                  }
                  existingAlter.columns.push(newCol);

                  if (refTable && refColumn) {
                    alterFks.push({
                      sourceTable: tableName,
                      sourceCols: [colName],
                      targetTable: refTable,
                      targetCols: [refColumn],
                    });
                  }
                }
              }
            } else {
              while (!stream.eof()) {
                const nextT = stream.peek();
                if (!nextT) break;
                if (nextT.type === 'SYMBOL' && (nextT.value === ',' || nextT.value === ';')) {
                  break;
                }
                stream.next();
              }
            }

            if (stream.consumeSymbol(',')) {
              continue;
            } else {
              stream.consumeSymbol(';');
              break;
            }
          }
        }
      }
    } else {
      while (!stream.eof()) {
        const t = stream.next();
        if (t && t.type === 'SYMBOL' && t.value === ';') {
          break;
        }
      }
    }
  }

  return { tables, alterFks, alterAddColumns };
}

// ─── PUBLIC PARSER API ────────────────────────────────────

export function parseSQLToERD(sql: string): { nodes: Node<Entity>[]; edges: Edge[] } {
  const nodes: Node<Entity>[] = [];
  const edges: Edge[] = [];

  const parsed = parseSqlDdl(sql);

  let xPos = 50;
  let yPos = 50;

  // 1. Create Nodes
  for (const table of parsed.tables) {
    const tableId = `node-${Math.random().toString(36).substr(2, 9)}`;

    // Collect table-level PK column names
    const tableLevelPks = new Set<string>();
    for (const c of table.constraints) {
      if (c.type === 'PRIMARY_KEY') {
        c.columns.forEach(col => tableLevelPks.add(col.toLowerCase()));
      }
    }

    const columns: Column[] = [];
    table.columns.forEach((col, idx) => {
      const isPk = col.is_pk || tableLevelPks.has(col.name.toLowerCase());
      const normalizedType = normalizeType(col.type);

      columns.push({
        id: `col-${Math.random().toString(36).substr(2, 9)}`,
        name: col.name,
        type: normalizedType,
        is_pk: isPk,
        is_nullable: !isPk && col.is_nullable,
        enum_values: col.enum_values || '',
        sort_order: idx,
      });
    });

    nodes.push({
      id: tableId,
      type: 'entity',
      position: { x: xPos, y: yPos },
      data: {
        id: tableId,
        name: table.name,
        columns,
        color: '#6366f1',
        x: xPos,
        y: yPos,
      },
    });

    xPos += 350;
    if (xPos > 1200) {
      xPos = 50;
      yPos += 400;
    }
  }

  // Helper to resolve relationships
  const processRel = (sourceTable: string, sourceCol: string, targetTable: string, targetCol: string) => {
    const sNode = nodes.find(n => n.data.name.toLowerCase() === sourceTable.toLowerCase());
    const tNode = nodes.find(n => n.data.name.toLowerCase() === targetTable.toLowerCase());

    if (sNode && tNode) {
      const sCol = sNode.data.columns.find(c => c.name.toLowerCase() === sourceCol.toLowerCase());
      const tCol = tNode.data.columns.find(c => c.name.toLowerCase() === targetCol.toLowerCase());

      if (sCol && tCol) {
        // Mark source column as FK
        sCol._is_fk = true;

        edges.push({
          id: `e-${sNode.id}-${tNode.id}-${Math.random()}`,
          source: sNode.id,
          target: tNode.id,
          sourceHandle: `col-${sCol.id}-source`,
          targetHandle: `col-${tCol.id}-target`,
          label: '1:N',
          type: 'smoothstep',
          animated: false,
        });
      }
    }
  };

  // 2. Process table level FK constraints
  for (const table of parsed.tables) {
    for (const c of table.constraints) {
      if (c.type === 'FOREIGN_KEY' && c.refTable) {
        const refCols = c.refColumns || [];
        c.columns.forEach((colName, idx) => {
          const targetColName = refCols[idx] || colName;
          processRel(table.name, colName, c.refTable!, targetColName);
        });
      }
    }
  }

  // 3. Process ALTER TABLE FK constraints
  for (const rel of parsed.alterFks) {
    const targetCols = rel.targetCols || [];
    rel.sourceCols.forEach((colName, idx) => {
      const targetColName = targetCols[idx] || colName;
      processRel(rel.sourceTable, colName, rel.targetTable, targetColName);
    });
  }

  return { nodes, edges };
}
