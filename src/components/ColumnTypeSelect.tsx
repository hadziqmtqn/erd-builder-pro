import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COLUMN_TYPES } from '../lib/utils';

interface ColumnTypeSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

export function ColumnTypeSelect({ value, onValueChange, className }: ColumnTypeSelectProps) {
  // Sort types alphabetically
  const sortedTypes = [...COLUMN_TYPES].sort((a, b) => a.localeCompare(b));

  return (
    <Select
      value={value}
      onValueChange={(v) => {
        onValueChange(v ?? '');
      }}
    >
      <SelectTrigger className={className ?? "h-8 text-[11px] font-medium bg-background/50 border-border/50"}>
        <SelectValue placeholder="Type" />
      </SelectTrigger>
      <SelectContent className="z-[1100]">
        {sortedTypes.map(type => (
          <SelectItem key={type} value={type} className="text-[11px]">
            {type}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
