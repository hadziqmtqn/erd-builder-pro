import { useMemo, useRef, useState } from 'react';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { createLowlight, common } from 'lowlight';
import { mergeAttributes } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { Copy, Database, GitBranch, MoreHorizontal, Play, Square } from 'lucide-react';
import { apiFetch, isInstalledApp } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/SearchableSelect';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { dbmlToERD } from '@/lib/dbml-converter';
import { parseSQLToERD } from '@/lib/sqlParser';
import { previewFlowchartContent } from '@/components/ai/actions/flowchartActions';

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
export const CODE_BLOCK_CONVERT_EVENT = 'erdbpro:code-block-convert';
export type CodeBlockConversionKind = 'erd' | 'flowchart';
export type CodeBlockConversionDetail = { kind: CodeBlockConversionKind; content: string };
const lowlight = createLowlight(common);
const CODE_LANGUAGES = [
  ['plaintext', 'Plain text'], ['sql', 'SQL'], ['dbml', 'DBML'], ['json', 'JSON'],
  ['javascript', 'JavaScript'], ['typescript', 'TypeScript'], ['tsx', 'TSX'], ['jsx', 'JSX'],
  ['html', 'HTML'], ['css', 'CSS'], ['bash', 'Bash'], ['python', 'Python'], ['php', 'PHP'],
  ['java', 'Java'], ['csharp', 'C#'], ['yaml', 'YAML'], ['xml', 'XML'], ['markdown', 'Markdown'],
] as const;
let catalogsPromise: Promise<Catalog[]> | null = null;
let catalogsCache: Catalog[] | null = null;

export function detectCodeBlockConversions(content: string, language: string | null): CodeBlockConversionKind[] {
  const source = content.trim();
  if (!source) return [];
  const normalizedLanguage = language?.toLowerCase() || '';
  const kinds: CodeBlockConversionKind[] = [];
  const looksLikeDbml = /(?:^|\n)\s*(?:Project|TableGroup|Table|Enum)\s+(?:"[^"]+"|[\w.]+)\s*\{|(?:^|\n)\s*Ref\s*:/im.test(source);
  const looksLikeSql = /\b(?:create|alter)\s+table\b/i.test(source);

  if (normalizedLanguage === 'dbml' || looksLikeDbml) {
    try { dbmlToERD(source); kinds.push('erd'); } catch {}
  } else if ((['sql', 'mysql', 'postgresql', 'sqlite'].includes(normalizedLanguage) || looksLikeSql) && looksLikeSql) {
    try { if (parseSQLToERD(source).nodes.length) kinds.push('erd'); } catch {}
  }

  if ((['json', 'flowchart'].includes(normalizedLanguage) || source.startsWith('{')) && previewFlowchartContent(source)?.nodes.length) {
    kinds.push('flowchart');
  }
  return kinds;
}

function requestConversion(kind: CodeBlockConversionKind, content: string) {
  window.dispatchEvent(new CustomEvent<CodeBlockConversionDetail>(CODE_BLOCK_CONVERT_EVENT, { detail: { kind, content } }));
}

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

function ExecutableCodeBlockView({ node, editor, updateAttributes }: NodeViewProps) {
  const executable = node.attrs.language === 'sql' && isInstalledApp() && editor.isEditable;
  const language = String(node.attrs.language || 'plaintext');
  const languageLabel = CODE_LANGUAGES.find(([value]) => value === language)?.[1] ?? language;
  const convertible = useMemo(() => detectCodeBlockConversions(node.textContent, node.attrs.language), [node.attrs.language, node.textContent]);
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
    <NodeViewWrapper data-note-code-block data-executable-sql={executable ? '' : undefined} className={`relative my-6 overflow-hidden rounded-lg border bg-card ${executable ? '' : 'not-prose'}`}>
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-md border bg-background/95 p-1 shadow-sm" contentEditable={false}>
        {editor.isEditable && (
          <Select value={language} onValueChange={value => value && updateAttributes({ language: value })}>
            <SelectTrigger size="sm" className="h-7 w-28 border-0 bg-transparent px-2 font-mono text-[10px]"><SelectValue>{languageLabel}</SelectValue></SelectTrigger>
            <SelectContent align="end">{CODE_LANGUAGES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" title="Code block actions" onPointerDown={event => event.stopPropagation()}>
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44" onPointerDown={event => event.stopPropagation()}>
            {convertible.includes('erd') && <DropdownMenuItem className="cursor-pointer" onClick={() => requestConversion('erd', node.textContent)}><Database /> Generate ERD</DropdownMenuItem>}
            {convertible.includes('flowchart') && <DropdownMenuItem className="cursor-pointer" onClick={() => requestConversion('flowchart', node.textContent)}><GitBranch /> Generate Flowchart</DropdownMenuItem>}
            {convertible.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem className="cursor-pointer" onClick={() => void navigator.clipboard.writeText(node.textContent)}><Copy /> Copy</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {executable && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 p-2 pr-32" contentEditable={false}>
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

      <pre className={executable ? 'm-0 rounded-none border-0' : 'm-0 pr-32'}>
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

export const ExecutableCodeBlock = CodeBlockLowlight.configure({ lowlight }).extend({
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
    return ReactNodeViewRenderer(ExecutableCodeBlockView);
  },
});
