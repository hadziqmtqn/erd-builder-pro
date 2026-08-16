import { Input } from '@/components/ui/input';

export function DestructiveConfirmationField({ expected, value, onChange }: { expected: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span>Type <strong className="font-mono">{expected}</strong> to confirm</span>
      <Input value={value} onChange={event => onChange(event.target.value)} autoComplete="off" />
    </label>
  );
}
