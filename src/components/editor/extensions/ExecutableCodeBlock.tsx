import { useRef, useState } from 'react';
import CodeBlock from '@tiptap/extension-code-block';
import { mergeAttributes, type NodeViewRendererProps } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { Play, Square } from 'lucide-react';
import { apiFetch, isInstalledApp } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/SearchableSelect';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Catalog = {
  id: number;
  label: string;
  databaseName: string;
  account?: { name?: string; type?: string };
};

type QueryResult = {
  columns: string[];
  rows: Record<string, unknown>[];
  durationMs?: number;
  truncated?: boolean;
};

const LAST_CATALOG_KEY = 'erdbpro:executable-note-catalog';
let catalogsPromise: Promise<Catalog[]> | null = null;
let catalogsCache: Catalog[] | null = null;

function loadCatalogs() {
  if (!catalogsPromise) {
    catalogsPromise = apiFetch('/api/catalogs')
      .then(async response => {
        const data = await response.json().catch(() => []);
        if (!response.ok) throw new Error(data.error || 'Failed to load DB Client catalogs');
        catalogsCache = (Array.isArray(data) ? data : []).filter(catalog => catalog.account?.type !== 'sqlite');
        return catalogsCache;
      })
      .catch(error => {
        catalogsPromise = null;
        throw error;
      });
  }
  return catalogsPromise;
}

function cellText(value: unknown) {
  if (value === null || value === undefined) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function ExecutableCodeBlockView({ node, editor }: NodeViewProps) {
  const executable = node.attrs.language === 'sql' && isInstalledApp() && editor.isEditable;
  const [catalogs, setCatalogs] = useState<Catalog[]>(() => catalogsCache ?? []);
  const [catalogId, setCatalogId] = useState(() => localStorage.getItem(LAST_CATALOG_KEY) || '');
  const [catalogsLoaded, setCatalogsLoaded] = useState(() => catalogsCache !== null);
  const [loadingCatalogs, setLoadingCatalogs] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const runningIdRef = useRef<string | null>(null);

  const ensureCatalogs = () => {
    if (catalogsLoaded || loadingCatalogs) return;
    setLoadingCatalogs(true);
    setError('');
    void loadCatalogs()
      .then(items => {
        setCatalogs(items);
        setCatalogId(current => items.some(item => String(item.id) === current) ? current : String(items[0]?.id ?? ''));
        setCatalogsLoaded(true);
      })
      .catch(runError => setError(runError.message))
      .finally(() => setLoadingCatalogs(false));
  };

  const selectCatalog = (value: string) => {
    setCatalogId(value);
    localStorage.setItem(LAST_CATALOG_KEY, value);
  };

  const run = async () => {
    if (!catalogId || !node.textContent.trim()) return;
    const runId = crypto.randomUUID();
    runningIdRef.current = runId;
    setRunning(true);
    setError('');
    try {
      const response = await apiFetch(`/api/catalogs/${catalogId}/query/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: node.textContent, runId, maxRows: 100 }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to run SQL query');
      if (runningIdRef.current === runId) setResult(data);
    } catch (runError: any) {
      if (runningIdRef.current === runId) setError(runError.message);
    } finally {
      if (runningIdRef.current === runId) {
        runningIdRef.current = null;
        setRunning(false);
      }
    }
  };

  const stop = async () => {
    const runId = runningIdRef.current;
    if (!runId) return;
    runningIdRef.current = null;
    setRunning(false);
    await apiFetch(`/api/catalogs/${catalogId}/query/cancel/${runId}`, { method: 'POST' });
  };

  return (
    <NodeViewWrapper data-executable-sql={executable ? '' : undefined} className={executable ? 'my-6 overflow-hidden rounded-lg border bg-card' : undefined}>
      {executable && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 p-2" contentEditable={false}>
          <span className="px-1 text-xs font-medium text-muted-foreground">SQL</span>
          <SearchableSelect
            value={catalogId}
            onChange={selectCatalog}
            items={catalogs}
            disabled={running}
            placeholder={loadingCatalogs ? 'Loading databases...' : catalogId ? 'Saved database' : 'Select database'}
            searchPlaceholder="Search database..."
            emptyMessage={loadingCatalogs ? 'Loading databases...' : 'No database found'}
            className="w-60"
            onOpen={ensureCatalogs}
            getItemValue={catalog => String(catalog.id)}
            getItemLabel={catalog => `${catalog.account?.name || 'Database'} · ${catalog.label || catalog.databaseName}`}
            filterItem={(catalog, query) => `${catalog.account?.name} ${catalog.label} ${catalog.databaseName}`.toLowerCase().includes(query.toLowerCase())}
          />
          <Button size="sm" variant={running ? 'destructive' : 'default'} disabled={!catalogId} onClick={() => void (running ? stop() : run())}>
            {running ? <Square data-icon="inline-start" /> : <Play data-icon="inline-start" />}
            {running ? 'Stop' : 'Run'}
          </Button>
        </div>
      )}

      <pre className={executable ? 'm-0 rounded-none border-0' : undefined}>
        <NodeViewContent as={'code' as any} />
      </pre>

      {executable && (error || result) && (
        <div className="max-h-72 overflow-auto border-t" contentEditable={false}>
          {error ? <p className="p-3 text-sm text-destructive">{error}</p> : result && (
            <>
              <Table className="text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    {result.columns.map(column => <TableHead key={column}>{column}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.rows.map((row, index) => (
                    <TableRow key={index}>
                      <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                      {result.columns.map(column => <TableCell key={column} className="max-w-72 truncate">{cellText(row[column])}</TableCell>)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                {result.rows.length} row{result.rows.length === 1 ? '' : 's'} · {result.durationMs ?? 0} ms{result.truncated ? ' · limited to 100 rows' : ''}
              </p>
            </>
          )}
        </div>
      )}
    </NodeViewWrapper>
  );
}

function plainCodeBlockView({ node, editor }: NodeViewRendererProps) {
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  pre.append(code);

  const syncLanguage = (language?: string | null) => {
    if (language) {
      pre.dataset.language = language;
      code.className = `language-${language}`;
    } else {
      delete pre.dataset.language;
      code.removeAttribute('class');
    }
  };
  syncLanguage(node.attrs.language);

  return {
    dom: pre,
    contentDOM: code,
    update: nextNode => {
      if (nextNode.type !== node.type) return false;
      if (nextNode.attrs.language === 'sql' && isInstalledApp() && editor.isEditable) return false;
      syncLanguage(nextNode.attrs.language);
      return true;
    },
  };
}

export const ExecutableCodeBlock = CodeBlock.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      language: {
        default: null,
        parseHTML: element => element.querySelector('code')?.className.match(/(?:^|\s)language-([^\s]+)/)?.[1]
          || element.getAttribute('data-language'),
        renderHTML: attributes => attributes.language ? { 'data-language': attributes.language } : {},
      },
    };
  },
  renderHTML({ node, HTMLAttributes }) {
    const language = node.attrs.language;
    return ['pre', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), ['code', language ? { class: `language-${language}` } : {}, 0]];
  },
  addNodeView() {
    const renderExecutable = ReactNodeViewRenderer(ExecutableCodeBlockView);
    return props => props.node.attrs.language === 'sql' && isInstalledApp() && props.editor.isEditable
      ? renderExecutable(props)
      : plainCodeBlockView(props);
  },
});
