import { Dispatch, SetStateAction } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createColumnHelpers, draftValue, formatBytes } from './data-viewer-utils';
import { RecordFieldEditor } from './RecordFieldEditor';

type DataViewerDetailsPanelProps = {
  activeTable: string | null;
  columnHelpers: ReturnType<typeof createColumnHelpers>;
  datePickerOpenColumn: string | null;
  draftRow: Record<string, any>;
  fkOptionsByColumn: Record<string, Record<string, any>[]>;
  foreignKeyByColumn: Map<string, any>;
  isRecordDirty: boolean;
  isSavingRecord: boolean;
  primaryKeyColumns: string[];
  records: any;
  selectedRow: Record<string, any> | null;
  setDatePickerOpenColumn: Dispatch<SetStateAction<string | null>>;
  setDetailsOpen: Dispatch<SetStateAction<boolean>>;
  setDraftRow: Dispatch<SetStateAction<Record<string, any>>>;
  onSubmitRecord: () => void;
  warnUnsaved: () => boolean;
};

export function DataViewerDetailsPanel({
  activeTable,
  columnHelpers,
  datePickerOpenColumn,
  draftRow,
  fkOptionsByColumn,
  foreignKeyByColumn,
  isRecordDirty,
  isSavingRecord,
  primaryKeyColumns,
  records,
  selectedRow,
  setDatePickerOpenColumn,
  setDetailsOpen,
  setDraftRow,
  onSubmitRecord,
  warnUnsaved,
}: DataViewerDetailsPanelProps) {
  return (
    <aside className="w-80 shrink-0 border-l bg-background">
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-3 border-b p-4">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-medium">{selectedRow ? 'Record Details' : 'Table Information'}</h3>
            <p className="truncate text-xs text-muted-foreground">{activeTable || 'No table selected'}</p>
          </div>
          <Button variant="ghost" size="icon-xs" onClick={() => warnUnsaved() && setDetailsOpen(false)} title="Close details">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {selectedRow && records ? (
            <div className="flex h-full flex-col">
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                {records.columns.map((column: string) => (
                  <div key={column} className="rounded-md border px-3 py-2">
                    <label className="truncate font-mono text-xs text-muted-foreground" htmlFor={`record-field-${column}`}>{column}</label>
                    <RecordFieldEditor
                      column={column}
                      columnHelpers={columnHelpers}
                      datePickerOpenColumn={datePickerOpenColumn}
                      draftRow={draftRow}
                      fkOptionsByColumn={fkOptionsByColumn}
                      foreignKeyByColumn={foreignKeyByColumn}
                      selectedRow={selectedRow}
                      setDatePickerOpenColumn={setDatePickerOpenColumn}
                      setDraftRow={setDraftRow}
                    />
                  </div>
                ))}
                {primaryKeyColumns.length === 0 && (
                  <p className="text-xs text-muted-foreground">This table has no primary key, so record editing is disabled.</p>
                )}
              </div>
              <div className="sticky bottom-0 grid grid-cols-2 gap-2 border-t bg-background p-3">
                <Button
                  variant="outline"
                  onClick={() => setDraftRow(Object.fromEntries(records.columns.map((column: string) => [
                    column,
                    draftValue(column, selectedRow[column], columnHelpers),
                  ])))}
                  disabled={!isRecordDirty || isSavingRecord}
                >
                  Cancel
                </Button>
                <Button
                  onClick={onSubmitRecord}
                  disabled={isSavingRecord || !isRecordDirty || primaryKeyColumns.length === 0}
                >
                  Submit
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-3">
              <div className="divide-y rounded-md border">
                {[
                  ['Data size', formatBytes(records?.tableInfo?.dataSize)],
                  ['Index size', formatBytes(records?.tableInfo?.indexSize)],
                  ['Total size', formatBytes(records?.tableInfo?.totalSize)],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-mono text-xs">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
