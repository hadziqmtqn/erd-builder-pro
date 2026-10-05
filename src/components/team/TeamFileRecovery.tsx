import { useMemo, useState } from "react";
import { Copy, Loader2, RefreshCw, Search } from "lucide-react";
import ConfirmModal from "@/components/ConfirmModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { recoveryFileKey, useTeamRecovery, type RecoveryType } from "@/hooks/useTeamRecovery";

const features: Record<RecoveryType, { label: string; color: string }> = {
  erd: { label: "ERD Builder", color: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200" },
  notes: { label: "Notes", color: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  drawings: { label: "Drawings", color: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200" },
  flowchart: { label: "Flowchart", color: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" },
};
const dateLabel = (date: string | null) => date ? new Date(date).toLocaleDateString() : "—";

export function TeamFileRecovery({ teamId }: { teamId: string }) {
  const recovery = useTeamRecovery(teamId);
  const [search, setSearch] = useState("");
  const [feature, setFeature] = useState<string | null>("all");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const files = useMemo(() => (recovery.inventory?.files || []).filter((file) =>
    (feature === "all" || feature === file.type) && `${file.name} ${file.projectName}`.toLowerCase().includes(search.toLowerCase())
  ), [recovery.inventory, search, feature]);
  const keys = files.map(recoveryFileKey);
  const checkedCount = keys.filter((key) => recovery.selected.has(key)).length;
  const hiddenSelectedCount = recovery.selected.size - checkedCount;
  const destination = recovery.inventory?.destinations.find((team) => team.id === recovery.targetTeamId);
  const disabled = recovery.loading || recovery.processing;

  return (
    <section className="space-y-4" aria-labelledby="recovery-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="recovery-title" className="text-lg font-semibold">Recover files</h2>
        <Button variant="outline" onClick={() => void recovery.load()} disabled={disabled}><RefreshCw className={recovery.loading ? "animate-spin" : ""} /> Refresh</Button>
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search files or projects" aria-label="Search recovery files" className="pl-9" disabled={recovery.processing} />
        </div>
        <Select value={feature} onValueChange={setFeature} disabled={recovery.processing}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Filter by file type"><SelectValue>{feature === "all" ? "All file types" : features[feature as RecoveryType]?.label}</SelectValue></SelectTrigger>
          <SelectContent><SelectGroup><SelectItem value="all">All file types</SelectItem>{Object.entries(features).map(([value, item]) => <SelectItem key={value} value={value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      </div>
      {recovery.error && <p role="alert" className="text-sm text-destructive">{recovery.error}</p>}
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader><TableRow>
            <TableHead className="w-12 pl-4"><Checkbox className="border-muted-foreground" aria-label="Select all visible files" checked={keys.length > 0 && checkedCount === keys.length} indeterminate={checkedCount > 0 && checkedCount < keys.length} onCheckedChange={(checked) => recovery.select(keys, checked)} disabled={disabled || keys.length === 0} /></TableHead>
            <TableHead>File</TableHead><TableHead>File type</TableHead><TableHead>Project</TableHead><TableHead>Updated</TableHead><TableHead>Recovery</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {recovery.loading ? <TableRow><TableCell colSpan={6} className="h-32 text-center"><span className="inline-flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading files…</span></TableCell></TableRow>
              : files.length === 0 ? <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">{recovery.error ? "Refresh to load the file list again." : search || feature !== "all" ? "No files match these filters." : "This Team has no available files to recover."}</TableCell></TableRow>
                : files.map((file) => <TableRow key={recoveryFileKey(file)} data-state={recovery.selected.has(recoveryFileKey(file)) ? "selected" : undefined}>
                  <TableCell className="pl-4"><Checkbox className="border-muted-foreground" aria-label={`Select ${file.name} in ${file.projectName}`} checked={recovery.selected.has(recoveryFileKey(file))} onCheckedChange={(checked) => recovery.select([recoveryFileKey(file)], checked)} disabled={recovery.processing} /></TableCell>
                  <TableCell className="max-w-80 whitespace-normal font-medium">{file.name}</TableCell>
                  <TableCell><Badge variant="secondary" className={features[file.type].color}>{features[file.type].label}</Badge></TableCell>
                  <TableCell className="max-w-64 whitespace-normal text-muted-foreground">{file.projectName}</TableCell>
                  <TableCell className="text-muted-foreground">{dateLabel(file.updatedAt)}</TableCell>
                  <TableCell>{file.recovery ? <div className="space-y-1"><Badge variant="outline">Recovered</Badge><p className="text-xs text-muted-foreground">{file.recovery.teamName} · {dateLabel(file.recovery.at)}</p></div> : <span className="text-muted-foreground">Not copied</span>}</TableCell>
                </TableRow>)}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="w-full space-y-2 sm:max-w-sm">
          <Label htmlFor="recovery-team">Destination Team</Label>
          <Select value={recovery.targetTeamId} onValueChange={recovery.chooseTarget} disabled={disabled || !recovery.inventory?.destinations.length}>
            <SelectTrigger id="recovery-team"><SelectValue>{destination?.name || "Choose an active Team"}</SelectValue></SelectTrigger>
            <SelectContent><SelectGroup>{recovery.inventory?.destinations.map((team) => <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
          {!recovery.loading && recovery.inventory && recovery.inventory.destinations.length === 0 && <p className="text-sm text-muted-foreground">Create an active Team before recovering files.</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p aria-live="polite" className="text-sm text-muted-foreground">{recovery.selected.size} selected{hiddenSelectedCount > 0 && ` · ${hiddenSelectedCount} hidden by filters`}</p>
          {recovery.selected.size > 0 && <Button variant="ghost" size="sm" disabled={recovery.processing} onClick={() => recovery.select([...recovery.selected], false)}>Clear selection</Button>}
          <Button onClick={() => setConfirmOpen(true)} disabled={disabled || !destination || recovery.selected.size === 0 || recovery.selected.size > 500}><Copy /> {recovery.processing ? "Recovering…" : "Recover selected files"}</Button>
        </div>
      </div>
      {recovery.selected.size > 500 && <p role="alert" className="text-sm text-destructive">Choose up to 500 files per recovery.</p>}
      <details className="text-sm text-muted-foreground"><summary className="w-fit cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-ring">What will be copied?</summary><p className="mt-2 max-w-3xl">File contents and ERD structure are copied into new projects. Existing media references are kept. Copies start private and are owned by you; discussion, comment and AI histories stay with the source.</p></details>
      <ConfirmModal isOpen={confirmOpen} title="Recover selected files?" message={`Copy ${recovery.selected.size} files into new projects in ${destination?.name || "the destination Team"}? Members of that Team will be able to access the copies. The quarantined originals will stay stored.`} confirmText="Recover files" variant="info" onCancel={() => setConfirmOpen(false)} onConfirm={() => { setConfirmOpen(false); void recovery.recover(); }} />
    </section>
  );
}
