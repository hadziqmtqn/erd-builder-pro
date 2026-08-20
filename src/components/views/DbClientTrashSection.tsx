import { DatabaseZap, RefreshCcw, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface Props {
  clients: any[];
  restore: (client: any) => Promise<void>;
  permanentlyDelete: (client: any) => void;
}

export function DbClientTrashSection({ clients, restore, permanentlyDelete }: Props) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <DatabaseZap size={18} className="text-cyan-400" /> DB Clients
        </h3>
        <Badge variant="outline">{clients.length} Items</Badge>
      </div>
      {clients.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-muted-foreground">No deleted DB Clients</div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader><TableRow>
              <TableHead>DB Client Name</TableHead><TableHead>Project</TableHead>
              <TableHead>Deleted At</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>{clients.map(client => (
              <TableRow key={client.id}>
                <TableCell className="flex items-center gap-2 font-medium"><DatabaseZap size={14} />{client.name}</TableCell>
                <TableCell className="text-xs font-semibold text-muted-foreground">{client.project?.name || '-'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(client.deleted_at || client.updated_at).toLocaleString()}</TableCell>
                <TableCell className="text-right"><div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => restore(client)}><RefreshCcw size={14} className="mr-1" />Restore</Button>
                  <Button variant="destructive" size="sm" onClick={() => permanentlyDelete(client)}><Trash2 size={14} className="mr-1" />Delete</Button>
                </div></TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
