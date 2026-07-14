import { COLUMN_TYPES } from '../lib/utils';
import { SearchableSelect } from './SearchableSelect';

interface ColumnTypeSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

const sortedTypes = [...COLUMN_TYPES].sort((a, b) => a.localeCompare(b));

export function ColumnTypeSelect({ value, onValueChange, className }: ColumnTypeSelectProps) {
  return (
    <SearchableSelect
      value={value}
      onChange={onValueChange}
      items={sortedTypes}
      placeholder="Type"
      searchPlaceholder="Search type..."
      emptyMessage="No types found"
      className={className}
      getItemValue={(t) => t}
      getItemLabel={(t) => t}
      filterItem={(t, q) => t.toLowerCase().includes(q.toLowerCase())}
    />
  );
}
