import { ChevronLeft, ChevronRight, Info, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

type DataViewerView = 'data' | 'structure';

type DataViewerFooterProps = {
  activeView: DataViewerView;
  page: number;
  records: any;
  tableColumnCount: number;
  totalPages: number;
  warnUnsaved: () => boolean;
  onAddColumn: () => void;
  onAddIndex: () => void;
  onInfo: () => void;
  onNextPage: () => void;
  onPrevPage: () => void;
  onViewChange: (view: DataViewerView) => void;
};

export function DataViewerFooter({
  activeView,
  page,
  records,
  tableColumnCount,
  totalPages,
  warnUnsaved,
  onAddColumn,
  onAddIndex,
  onInfo,
  onNextPage,
  onPrevPage,
  onViewChange,
}: DataViewerFooterProps) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-2 border-t bg-muted/10 shrink-0">
      <div className="flex items-center gap-1 justify-self-start">
        {(['data', 'structure'] as const).map(view => (
          <Button
            key={view}
            variant={activeView === view ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 px-3 capitalize"
            onClick={() => onViewChange(view)}
          >
            {view}
          </Button>
        ))}
        {activeView === 'structure' && (
          <>
            <Button variant="outline" size="sm" className="h-7 px-2" onClick={onAddColumn}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Column
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2" onClick={onAddIndex}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Index
            </Button>
            <Button variant="ghost" size="icon-xs" onClick={onInfo} title="Show table SQL">
              <Info className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
      <span className="text-xs text-muted-foreground justify-self-center">
        {activeView === 'structure'
          ? `${tableColumnCount} columns`
          : records && records.total > 0
            ? `${((page || 1) - 1) * (records.pageSize || 50) + 1}-${Math.min((page || 1) * (records.pageSize || 50), Number(records.total))} of ${records.total} rows`
            : '0 rows'}
      </span>
      {activeView === 'data' && records && (
        <div className="flex items-center gap-1 justify-self-end">
          <Button variant="outline" size="icon-xs" disabled={page <= 1} onClick={() => warnUnsaved() && onPrevPage()}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon-xs" disabled={page >= totalPages} onClick={() => warnUnsaved() && onNextPage()}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
