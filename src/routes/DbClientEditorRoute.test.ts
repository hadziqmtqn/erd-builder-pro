import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ cursor: 0, slots: [] as any[], effects: [] as any[], mode: 'data', api: vi.fn(), setNodes: vi.fn(), setEdges: vi.fn(), breadcrumb: vi.fn(), viewport: vi.fn(), cache: new Map(), error: vi.fn() }));
vi.mock('react', async importOriginal => ({ ...await importOriginal<any>(),
  useState: (initial: any) => { const i = mock.cursor++; if (!(i in mock.slots)) mock.slots[i] = typeof initial === 'function' ? initial() : initial; return [mock.slots[i], (value: any) => { mock.slots[i] = typeof value === 'function' ? value(mock.slots[i]) : value; }]; },
  useRef: (value: any) => { const i = mock.cursor++; return mock.slots[i] ??= { current: value }; },
  useCallback: (callback: any) => callback,
  useEffect: (effect: any) => { mock.effects.push(effect); },
}));
vi.mock('react-router-dom', () => ({ useParams: () => ({ id: 'qa-client' }), useSearchParams: () => [new URLSearchParams(`tab=${mock.mode}`), vi.fn()] }));
vi.mock('@xyflow/react', () => ({ ReactFlowProvider: 'provider', useNodesState: () => [[], mock.setNodes, vi.fn()], useEdgesState: () => [[], mock.setEdges, vi.fn()], useReactFlow: () => ({ setViewport: mock.viewport, getNodes: () => [], getViewport: () => ({}), fitView: vi.fn() }) }));
vi.mock('@/lib/api', () => ({ apiFetch: (...args: any[]) => mock.api(...args), getAuthToken: () => 'qa-session' }));
vi.mock('@/providers/WorkspaceProvider', () => ({ useWorkspace: () => ({ user: { id: 'qa' }, setBreadcrumbLabel: mock.breadcrumb }) }));
vi.mock('@/hooks/useImageExporter', () => ({ useImageExporter: () => ({ handleExportImage: vi.fn() }) }));
vi.mock('@/hooks/useDataViewerHelpers', () => ({ getSchemaCache: (id: number) => mock.cache.get(id), setSchemaCache: (id: number, value: any) => mock.cache.set(id, value) }));
vi.mock('sonner', () => ({ toast: { error: (...args: any[]) => mock.error(...args) } }));
vi.mock('@/components/views/ERDView', () => ({ ERDView: 'erd' }));
vi.mock('@/components/modals/RelationshipPropertiesModal', () => ({ RelationshipPropertiesModal: 'modal' }));
vi.mock('@/components/ProjectFileTabs', () => ({ ProjectFileTabs: 'tabs' }));
vi.mock('@/components/db-connect/DataViewer', () => ({ DataViewer: 'data-viewer' }));
vi.mock('@/components/db-connect/DataQueryView', () => ({ DataQueryView: 'query' }));
vi.mock('@/components/db-connect/DataViewerModeToolbar', () => ({ DataViewerModeToolbar: 'toolbar' }));
import { DbClientEditorRoute } from './DbClientEditorRoute';

const document = { uid: 'qa-client', catalog_id: 42, name: 'Synthetic', data: {} };
const response = (data: any) => ({ ok: true, json: async () => data });
const render = () => { mock.cursor = 0; mock.effects = []; const route = DbClientEditorRoute(); return (route.props.children.type as any)(route.props.children.props); };
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); mock.cursor = 0; mock.slots = []; mock.effects = []; mock.mode = 'data'; mock.cache.clear();
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('mounts Data after document authorization without waiting for the entire database schema', async () => {
  mock.api.mockResolvedValue(response(document));
  render(); mock.effects[2](); await vi.runAllTimersAsync();
  const page = render();
  expect(page.props.children[2].props.children.props.connectionId).toBe(42);
  expect(mock.api.mock.calls.map(call => call[0])).toEqual(['/api/db-clients/qa-client']);
  expect(mock.setNodes).not.toHaveBeenCalled();
});

it('loads ERD schema on demand and ignores a late response after leaving ERD', async () => {
  mock.api.mockResolvedValueOnce(response(document));
  render(); mock.effects[2](); await vi.runAllTimersAsync();
  let complete!: (value: any) => void;
  mock.api.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
  mock.mode = 'erd'; render(); const cleanup = mock.effects[1]();
  expect(mock.api.mock.calls.at(-1)?.[0]).toBe('/api/catalogs/42/schema');
  cleanup(); complete(response({ schema: [], dbType: 'postgresql' })); await vi.runAllTimersAsync();
  expect(mock.cache.size).toBe(0); expect(mock.setNodes).not.toHaveBeenCalled();
  expect(mock.error).not.toHaveBeenCalled();
});

it('does not mount Data or read schema when document authorization fails', async () => {
  mock.api.mockResolvedValue({ ok: false, json: async () => ({ error: 'Not found' }) });
  render(); mock.effects[2](); await vi.runAllTimersAsync();
  const page = render();
  expect(String(page.props.children)).toContain('DB Client not found');
  expect(mock.api.mock.calls.map(call => call[0])).toEqual(['/api/db-clients/qa-client']);
  expect(mock.setNodes).not.toHaveBeenCalled();
});

it('reuses schema already read by Data and preserves the canvas on a mode round-trip', async () => {
  mock.api.mockResolvedValueOnce(response(document));
  render(); mock.effects[2](); await vi.runAllTimersAsync();
  mock.cache.set(42, { schema: [], dbType: 'mysql' });
  mock.mode = 'erd'; render(); mock.effects[1](); await vi.runAllTimersAsync();
  expect(mock.setNodes).toHaveBeenCalledTimes(1);
  mock.mode = 'data'; render(); mock.effects[1]();
  mock.mode = 'erd'; render(); mock.effects[1](); await vi.runAllTimersAsync();
  expect(mock.setNodes).toHaveBeenCalledTimes(1);
  expect(mock.api).toHaveBeenCalledTimes(1);
});
