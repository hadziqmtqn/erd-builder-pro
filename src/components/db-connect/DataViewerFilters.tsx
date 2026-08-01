import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RECORD_FILTER_OPERATORS } from './data-viewer-utils';

type DataViewerFiltersProps = {
  columnOptions: string[];
  filters: any[];
  addFilter: (column: string) => void;
  applyFilter: (filter: any) => void;
  applyFilters: (filters: any[]) => void;
  clearFilters: () => void;
  removeFilter: (id: string) => void;
  setShowFilters: (open: boolean) => void;
  updateFilter: (id: string, patch: any) => void;
  warnUnsaved: () => boolean;
};

export function DataViewerFilters({
  columnOptions,
  filters,
  addFilter,
  applyFilter,
  applyFilters,
  clearFilters,
  removeFilter,
  setShowFilters,
  updateFilter,
  warnUnsaved,
}: DataViewerFiltersProps) {
  return (
    <div className="shrink-0 border-b bg-muted/10 px-3 py-2">
      <div className="space-y-1.5">
        {filters.map(filter => {
          const isNullCheck = filter.operator === 'IS' || filter.operator === 'IS NOT';
          const isBetween = filter.operator === 'BETWEEN' || filter.operator === 'NOT BETWEEN';
          return (
            <div key={filter.id} className="flex min-w-0 items-center gap-1.5">
              <Checkbox
                checked={filter.enabled}
                onCheckedChange={checked => updateFilter(filter.id, { enabled: checked })}
                aria-label="Enable filter"
              />
              <Select value={filter.column} onValueChange={value => value && updateFilter(filter.id, { column: value })}>
                <SelectTrigger className="h-8 min-w-32 max-w-48 text-xs">
                  <SelectValue>{filter.column || 'Column'}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {columnOptions.map(column => <SelectItem key={column} value={column} className="text-xs">{column}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filter.operator} onValueChange={value => value && updateFilter(filter.id, { operator: value })}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue>{filter.operator}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {RECORD_FILTER_OPERATORS.map(op => <SelectItem key={op} value={op} className="text-xs">{op}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                value={isNullCheck ? 'NULL' : filter.value}
                disabled={isNullCheck}
                onChange={e => updateFilter(filter.id, { value: e.target.value })}
                placeholder={filter.operator.includes('IN') ? 'a, b, c' : 'Value'}
                className="h-8 min-w-28 flex-1 text-xs"
              />
              {isBetween && (
                <Input
                  value={filter.value2 || ''}
                  onChange={e => updateFilter(filter.id, { value2: e.target.value })}
                  placeholder="And"
                  className="h-8 min-w-28 flex-1 text-xs"
                />
              )}
              <Button variant="secondary" size="sm" className="h-8" onClick={() => warnUnsaved() && applyFilter(filter)}>
                Apply
              </Button>
              <Button
                variant="outline"
                size="icon-xs"
                disabled={filters.length <= 1}
                onClick={() => removeFilter(filter.id)}
                title="Remove filter"
              >
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon-xs"
                onClick={() => addFilter(filter.column || columnOptions[0] || '')}
                title="Add filter"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })}
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => {
              if (!warnUnsaved()) return;
              clearFilters();
              setShowFilters(false);
            }}
          >
            Clear
          </Button>
          <Button size="sm" className="h-8" onClick={() => warnUnsaved() && applyFilters(filters)}>
            Apply All
          </Button>
        </div>
      </div>
    </div>
  );
}
