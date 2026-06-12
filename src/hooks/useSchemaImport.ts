import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';

interface SchemaImportResult {
  diagram: any;
  tableCount: number;
}

export function useSchemaImport() {
  const [isImporting, setIsImporting] = useState(false);

  const importFromConnection = async (
    connectionId: number,
    diagramName: string,
  ): Promise<SchemaImportResult | null> => {
    setIsImporting(true);
    try {
      const res = await apiFetch(`/api/connections/${connectionId}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: diagramName }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to import schema');
      }

      const data = await res.json();
      toast.success(`Imported ${data.table_count} tables from production DB`);
      return { diagram: data.diagram, tableCount: data.table_count };
    } catch (e: any) {
      toast.error(e.message || 'Failed to import schema');
      return null;
    } finally {
      setIsImporting(false);
    }
  };

  return { importFromConnection, isImporting };
}
