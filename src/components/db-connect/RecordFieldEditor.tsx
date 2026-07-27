import { Dispatch, SetStateAction } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, ChevronDownIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  createColumnHelpers,
  datePart,
  displayCellValue,
  formatDate,
  parseDraftDate,
  timePart,
} from './data-viewer-utils';

type RecordFieldEditorProps = {
  column: string;
  columnHelpers: ReturnType<typeof createColumnHelpers>;
  datePickerOpenColumn: string | null;
  draftRow: Record<string, any>;
  fkOptionsByColumn: Record<string, Record<string, any>[]>;
  foreignKeyByColumn: Map<string, any>;
  selectedRow: Record<string, any> | null;
  allowPrimaryKey?: boolean;
  setDatePickerOpenColumn: Dispatch<SetStateAction<string | null>>;
  setDraftRow: Dispatch<SetStateAction<Record<string, any>>>;
};

export function RecordFieldEditor({
  column,
  columnHelpers,
  datePickerOpenColumn,
  draftRow,
  fkOptionsByColumn,
  foreignKeyByColumn,
  selectedRow,
  allowPrimaryKey = false,
  setDatePickerOpenColumn,
  setDraftRow,
}: RecordFieldEditorProps) {
  const fieldId = `record-field-${column}`;
  const {
    enumValues,
    isBooleanColumn,
    isDateColumn,
    isDateTimeColumn,
    isEnumColumn,
    isLongColumn,
    isNumericColumn,
    isReadOnlyColumn,
  } = columnHelpers;

  if (isReadOnlyColumn(column, allowPrimaryKey)) {
    return (
      <Input
        id={fieldId}
        value={String(draftRow[column] ?? '')}
        disabled
        className="mt-1 h-8 font-mono text-xs"
        placeholder={selectedRow?.[column] === null ? 'NULL' : ''}
      />
    );
  }

  if (isEnumColumn(column)) {
    const options = enumValues(column);
    const current = String(draftRow[column] ?? '');
    return (
      <Select value={current} onValueChange={value => setDraftRow(prev => ({ ...prev, [column]: value }))}>
        <SelectTrigger id={fieldId} className="mt-1 h-8 font-mono text-xs">
          <SelectValue>{current}</SelectValue>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} className="max-h-64">
          {options.map(value => (
            <SelectItem key={value} value={value} className="text-xs">{value}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  const fk = foreignKeyByColumn.get(column) as any;
  if (fk) {
    const options = fkOptionsByColumn[column] || [];
    const current = draftRow[column] ?? '';
    const values = new Set(options.map(row => String(row[fk.ref_column])));
    const mergedOptions = current !== '' && !values.has(String(current))
      ? [{ [fk.ref_column]: current }, ...options]
      : options;

    return (
      <Select value={String(current)} onValueChange={value => setDraftRow(prev => ({ ...prev, [column]: value }))}>
        <SelectTrigger id={fieldId} className="mt-1 h-8 font-mono text-xs">
          <SelectValue>{String(current)}</SelectValue>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} className="max-h-64">
          {mergedOptions.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">No parent records</div>
          ) : mergedOptions.map((row: any) => {
            const value = String(row[fk.ref_column]);
            const labelColumn = Object.keys(row).find(key => key !== fk.ref_column && row[key] !== null && row[key] !== undefined);
            const label = labelColumn ? `${value} - ${displayCellValue(labelColumn, row[labelColumn], columnHelpers)}` : value;
            return <SelectItem key={value} value={value} className="text-xs">{label}</SelectItem>;
          })}
        </SelectContent>
      </Select>
    );
  }

  if (isBooleanColumn(column)) {
    return (
      <Input
        id={fieldId}
        type="number"
        min={0}
        max={1}
        step={1}
        value={draftRow[column] ?? ''}
        onChange={e => setDraftRow(prev => ({ ...prev, [column]: e.target.value }))}
        className="mt-1 h-8 font-mono text-xs"
        placeholder={selectedRow?.[column] === null ? 'NULL' : '0 or 1'}
      />
    );
  }

  if (isLongColumn(column)) {
    return (
      <Textarea
        id={fieldId}
        value={draftRow[column] ?? ''}
        onChange={e => setDraftRow(prev => ({ ...prev, [column]: e.target.value }))}
        className="mt-1 min-h-16 resize-y font-mono text-xs"
        placeholder={selectedRow?.[column] === null ? 'NULL' : ''}
      />
    );
  }

  if (isDateColumn(column) || isDateTimeColumn(column)) {
    const current = String(draftRow[column] ?? '');
    const selectedDate = parseDraftDate(current);
    return (
      <FieldGroup className={`mt-1 gap-2 ${isDateTimeColumn(column) ? 'grid-cols-[minmax(0,1fr)_minmax(0,6.5rem)]' : ''}`}>
        <Field className="min-w-0">
          <Popover open={datePickerOpenColumn === column} onOpenChange={open => setDatePickerOpenColumn(open ? column : null)}>
            <PopoverTrigger
              render={
                <Button id={fieldId} type="button" variant="outline" className="h-8 w-full min-w-0 justify-between font-mono text-xs font-normal">
                  <span className="flex min-w-0 items-center gap-2 truncate">
                    <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    {selectedDate ? format(selectedDate, 'PPP') : 'Select date'}
                  </span>
                  <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </Button>
              }
            />
            <PopoverContent align="start" className="w-auto overflow-hidden p-0">
              <Calendar
                mode="single"
                selected={selectedDate}
                captionLayout="dropdown"
                defaultMonth={selectedDate}
                onSelect={date => {
                  if (!date) return;
                  const nextDate = formatDate(date);
                  setDraftRow(prev => ({
                    ...prev,
                    [column]: isDateTimeColumn(column) ? `${nextDate} ${timePart(prev[column])}` : nextDate,
                  }));
                  setDatePickerOpenColumn(null);
                }}
                classNames={{
                  month_caption: 'flex justify-center px-2 pt-2',
                  caption_label: 'pointer-events-none relative z-[1] inline-flex whitespace-nowrap text-sm font-medium leading-none',
                  dropdowns: 'flex items-center gap-2',
                  dropdown_root: 'relative flex h-8 min-w-24 flex-row items-center justify-center gap-2 rounded-md border bg-background px-3 text-sm font-medium shadow-sm [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:shrink-0 [&>svg]:text-muted-foreground',
                  dropdown: 'absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0',
                }}
              />
            </PopoverContent>
          </Popover>
        </Field>
        {isDateTimeColumn(column) && (
          <Field className="min-w-0">
            <FieldLabel htmlFor={`${fieldId}-time`} className="sr-only">Time</FieldLabel>
            <Input
              id={`${fieldId}-time`}
              type="time"
              step="1"
              value={timePart(current)}
              onChange={e => {
                const nextTime = e.target.value.length === 5 ? `${e.target.value}:00` : e.target.value;
                setDraftRow(prev => ({ ...prev, [column]: `${datePart(prev[column]) || formatDate(new Date())} ${nextTime}` }));
              }}
              className="h-8 min-w-0 bg-background px-2 font-mono text-xs"
            />
          </Field>
        )}
      </FieldGroup>
    );
  }

  return (
    <Input
      id={fieldId}
      type={isNumericColumn(column) ? 'number' : 'text'}
      value={String(draftRow[column] ?? '')}
      onChange={e => setDraftRow(prev => ({ ...prev, [column]: e.target.value }))}
      className="mt-1 h-8 font-mono text-xs"
      placeholder={selectedRow?.[column] === null ? 'NULL' : ''}
    />
  );
}
