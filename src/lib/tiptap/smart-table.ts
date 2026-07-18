import { Extension, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Node } from '@tiptap/pm/model';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';

export const SmartTableRow = TableRow.extend({
  addAttributes() {
    return {
      rowType: {
        default: 'data',
        parseHTML: element => element.getAttribute('data-row-type'),
        renderHTML: attributes => {
          if (attributes.rowType === 'data') return {}; // Keep HTML clean for default
          return {
            'data-row-type': attributes.rowType,
            // Add utility classes for visual feedback
            class: attributes.rowType === 'header' 
              ? 'bg-muted/50 font-semibold border-b-2 border-border/80' 
              : attributes.rowType === 'footer'
              ? 'bg-muted/30 font-semibold border-t-2 border-border/80'
              : ''
          };
        },
      },
    };
  },
});

export const SmartTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      formula: {
        default: null,
        parseHTML: element => element.getAttribute('data-formula'),
        renderHTML: attributes => {
          if (!attributes.formula) return {};
          return {
            'data-formula': attributes.formula,
          };
        },
      },
      formulaTitle: {
        default: null,
        parseHTML: element => element.getAttribute('data-formula-title'),
        renderHTML: attributes => {
          if (!attributes.formulaTitle) return {};
          return {
            'data-formula-title': attributes.formulaTitle,
            title: attributes.formulaTitle,
          };
        },
      },
    };
  },
});

export const SmartTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      formula: {
        default: null,
        parseHTML: element => element.getAttribute('data-formula'),
        renderHTML: attributes => {
          if (!attributes.formula) return {};
          return {
            'data-formula': attributes.formula,
          };
        },
      },
      formulaTitle: {
        default: null,
        parseHTML: element => element.getAttribute('data-formula-title'),
        renderHTML: attributes => {
          if (!attributes.formulaTitle) return {};
          return {
            'data-formula-title': attributes.formulaTitle,
            title: attributes.formulaTitle,
          };
        },
      },
    };
  },
});

function parseNumber(str: string): number {
  const cleanStr = str.replace(/[^\d.,-]/g, '');
  if (!cleanStr) return 0;
  
  const hasComma = cleanStr.includes(',');
  const hasDot = cleanStr.includes('.');
  let numStr = cleanStr;
  
  if (hasComma && hasDot) {
    if (cleanStr.lastIndexOf(',') > cleanStr.lastIndexOf('.')) {
      numStr = cleanStr.replace(/\./g, '').replace(',', '.');
    } else {
      numStr = cleanStr.replace(/,/g, '');
    }
  } else if (hasComma) {
    const parts = cleanStr.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      numStr = cleanStr.replace(',', '.');
    } else {
      numStr = cleanStr.replace(/,/g, '');
    }
  } else if (hasDot) {
    const parts = cleanStr.split('.');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      numStr = cleanStr.replace(/\./g, '');
    }
  }
  return parseFloat(numStr) || 0;
}

function parseNumericValue(str: string): number | null {
  if (!/[\d]/.test(str)) return null;
  return parseNumber(str);
}

function formatNumber(num: number): string {
  if (num === 0) return '0';
  return new Intl.NumberFormat('id-ID').format(num);
}

type FormulaKind = 'sum' | 'avg' | 'mul' | 'product' | 'sumv' | 'avgv' | 'mulv' | 'productv' | 'sumh' | 'avgh' | 'mulh' | 'producth';
type TableCellInfo = { node: Node, pos: number, text: string, formula: FormulaKind | null };
type TableRowInfo = { node: Node, pos: number, type: string, cells: TableCellInfo[] };

function parseFormula(text: string, existing: FormulaKind | null): FormulaKind | null {
  if (text === '=sum' || text === '=sum()') return 'sum';
  if (text === '=avg' || text === '=avg()' || text === '=average' || text === '=average()') return 'avg';
  if (text === '=mul' || text === '=mul()' || text === '=product' || text === '=product()') return 'product';
  if (text === '=sumv' || text === '=sumv()' || text === '=sum-vertical' || text === '=sumvertical') return 'sumv';
  if (text === '=avgv' || text === '=avgv()' || text === '=avg-vertical' || text === '=avgvertical') return 'avgv';
  if (text === '=mulv' || text === '=mulv()' || text === '=productv' || text === '=productv()') return 'productv';
  if (text === '=sumh' || text === '=sumh()' || text === '=sum-horizontal' || text === '=sumhorizontal') return 'sumh';
  if (text === '=avgh' || text === '=avgh()' || text === '=avg-horizontal' || text === '=avghorizontal') return 'avgh';
  if (text === '=mulh' || text === '=mulh()' || text === '=producth' || text === '=producth()') return 'producth';
  if (text === '' && existing) return null;
  return existing;
}

function calculate(values: string[], formula: FormulaKind): number {
  let sum = 0;
  let product = 1;
  let count = 0;
  for (const text of values) {
    const value = parseNumericValue(text);
    if (value === null) continue;
    sum += value;
    product *= value;
    count++;
  }
  if (formula === 'avg' || formula === 'avgv' || formula === 'avgh') {
    return count > 0 ? Math.round((sum / count) * 100) / 100 : 0;
  }
  if (formula === 'mul' || formula === 'product' || formula === 'mulv' || formula === 'productv' || formula === 'mulh' || formula === 'producth') {
    return count > 0 ? product : 0;
  }
  return sum;
}

function replaceCellText(tr: any, schema: any, cell: TableCellInfo, text: string): void {
  const startPos = tr.mapping.map(cell.pos + 1);
  const endPos = tr.mapping.map(cell.pos + cell.node.nodeSize - 1);
  tr.replaceWith(
    startPos,
    endPos,
    schema.nodes.paragraph.create(null, text ? schema.text(text) : null),
  );
}

function colLabel(index: number): string {
  let label = '';
  let n = index + 1;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

function cellRef(rowIdx: number, colIdx: number): string {
  return `${colLabel(colIdx)}${rowIdx + 1}`;
}

function formulaLabel(formula: FormulaKind): string {
  if (formula.startsWith('avg')) return formula.endsWith('h') ? 'AVGH' : formula.endsWith('v') ? 'AVGV' : 'AVG';
  if (formula.startsWith('mul') || formula.startsWith('product')) {
    return formula.endsWith('h') ? 'PRODUCTH' : formula.endsWith('v') ? 'PRODUCTV' : 'PRODUCT';
  }
  return formula.endsWith('h') ? 'SUMH' : formula.endsWith('v') ? 'SUMV' : 'SUM';
}

function refsLabel(refs: string[]): string {
  if (refs.length === 0) return '';
  if (refs.length === 1) return refs[0];
  return `${refs[0]}:${refs[refs.length - 1]}`;
}

function formulaTitle(formula: FormulaKind, refs: string[]): string {
  const range = refsLabel(refs);
  return range ? `${formulaLabel(formula)}(${range})` : `${formulaLabel(formula)}()`;
}

function setFormulaTitle(tr: any, cell: TableCellInfo, formulaTitle: string | null): boolean {
  if (cell.node.attrs.formulaTitle === formulaTitle) return false;
  tr.setNodeMarkup(
    tr.mapping.map(cell.pos),
    undefined,
    { ...cell.node.attrs, formula: cell.formula, formulaTitle },
  );
  return true;
}

export const SmartTableEngine = Extension.create({
  name: 'smartTableEngine',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('smartTableEngine'),
        appendTransaction: (transactions, oldState, newState) => {
          if (!transactions.some(tr => tr.docChanged)) {
            return;
          }

          let tr = newState.tr;
          let modified = false;

          newState.doc.descendants((node, pos) => {
            if (node.type.name === 'table') {
              const rows: TableRowInfo[] = [];
              
              node.forEach((rowNode, rowOffset) => {
                const rowPos = pos + 1 + rowOffset;
                const rowType = rowNode.attrs.rowType || 'data';
                const cells: any[] = [];
                
                rowNode.forEach((cellNode, cellOffset) => {
                  const cellPos = rowPos + 1 + cellOffset;
                  const text = cellNode.textContent.trim().toLowerCase();
                  
                  const formula = parseFormula(text, cellNode.attrs.formula);

                  // Apply formula attribute change immediately if needed
                  if (formula !== cellNode.attrs.formula) {
                     tr.setNodeMarkup(tr.mapping.map(cellPos), undefined, { ...cellNode.attrs, formula, formulaTitle: formula ? cellNode.attrs.formulaTitle : null });
                     modified = true;
                  }

                  cells.push({
                    node: cellNode,
                    pos: cellPos,
                    text: cellNode.textContent.trim(),
                    formula: formula
                  });
                });
                
                rows.push({ node: rowNode, pos: rowPos, type: rowType, cells });
              });

              const numCols = Math.max(...rows.map(r => r.cells.length));

              // Calculate horizontal formulas: =SUMH / =AVGH / =PRODUCTH. They aggregate
              // numeric cells to the left of the formula cell in the same row.
              for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
                const row = rows[rowIdx];
                for (let colIdx = 0; colIdx < row.cells.length; colIdx++) {
                  const cell = row.cells[colIdx];
                  const cellFormula = cell.formula;
                  if (cellFormula !== 'sumh' && cellFormula !== 'avgh' && cellFormula !== 'mulh' && cellFormula !== 'producth') continue;

                  const sourceCells = row.cells.slice(0, colIdx);
                  const sourceRefs = sourceCells
                    .map((sourceCell, sourceColIdx) => parseNumericValue(sourceCell.text) === null ? null : cellRef(rowIdx, sourceColIdx))
                    .filter(Boolean) as string[];
                  const nextTitle = formulaTitle(cellFormula, sourceRefs);
                  const expectedText = formatNumber(
                    calculate(sourceCells.map(c => c.text), cellFormula),
                  );
                  if (setFormulaTitle(tr, cell, nextTitle)) modified = true;
                  if (cell.text !== expectedText && cell.formula === cellFormula) {
                    replaceCellText(tr, newState.schema, cell, expectedText);
                    modified = true;
                  }
                }
              }
              
              for (let colIdx = 0; colIdx < numCols; colIdx++) {
                // Calculate Subtotals/Averages (Header rows)
                for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
                  const row = rows[rowIdx];
                  const cellFormula = row.cells[colIdx]?.formula;
                  
                  if (row.type === 'header' && (cellFormula === 'sum' || cellFormula === 'avg' || cellFormula === 'mul' || cellFormula === 'product' || cellFormula === 'sumv' || cellFormula === 'avgv' || cellFormula === 'mulv' || cellFormula === 'productv')) {
                    const values: string[] = [];
                    const refs: string[] = [];
                    for (let i = rowIdx + 1; i < rows.length; i++) {
                      const targetRow = rows[i];
                      if (targetRow.type === 'header' || targetRow.type === 'footer') break;
                      if (targetRow.type === 'data' && targetRow.cells[colIdx]) {
                        const cellText = targetRow.cells[colIdx].text;
                        if (parseNumericValue(cellText) !== null) {
                          values.push(cellText);
                          refs.push(cellRef(i, colIdx));
                        }
                      }
                    }
                    
                    const expectedText = formatNumber(calculate(values, cellFormula));
                    const nextTitle = formulaTitle(cellFormula, refs);
                    const cell = row.cells[colIdx];
                    if (setFormulaTitle(tr, cell, nextTitle)) modified = true;
                    if (cell.text !== expectedText && cell.formula === cellFormula) {
                      replaceCellText(tr, newState.schema, cell, expectedText);
                      modified = true;
                    }
                  }
                }

                // Calculate Grand Totals/Averages (Footer rows)
                for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
                  const row = rows[rowIdx];
                  const cellFormula = row.cells[colIdx]?.formula;
                  
                  if (row.type === 'footer' && (cellFormula === 'sum' || cellFormula === 'avg' || cellFormula === 'mul' || cellFormula === 'product' || cellFormula === 'sumv' || cellFormula === 'avgv' || cellFormula === 'mulv' || cellFormula === 'productv')) {
                    const values: string[] = [];
                    const refs: string[] = [];
                    for (let i = 0; i < rows.length; i++) {
                      const targetRow = rows[i];
                      // Grand total only computes data rows to avoid double counting
                      if (targetRow.type === 'data' && targetRow.cells[colIdx]) {
                        const cellText = targetRow.cells[colIdx].text;
                        if (parseNumericValue(cellText) !== null) {
                          values.push(cellText);
                          refs.push(cellRef(i, colIdx));
                        }
                      }
                    }
                    
                    const expectedText = formatNumber(calculate(values, cellFormula));
                    const nextTitle = formulaTitle(cellFormula, refs);
                    const cell = row.cells[colIdx];
                    if (setFormulaTitle(tr, cell, nextTitle)) modified = true;
                    if (cell.text !== expectedText && cell.formula === cellFormula) {
                      replaceCellText(tr, newState.schema, cell, expectedText);
                      modified = true;
                    }
                  }
                }
              }
            }
            return true; // continue descending
          });

          return modified ? tr : undefined;
        }
      })
    ];
  }
});
