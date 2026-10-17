import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({ effects: [] as (() => unknown)[], refs: [] as any[], api: null as any, state: 0 }));
vi.mock('react', async () => ({
  ...await vi.importActual<typeof import('react')>('react'),
  useState: (initial: unknown) => [harness.state++ === 0 ? harness.api : initial, vi.fn()],
  useRef: (current: unknown) => { const ref = { current }; harness.refs.push(ref); return ref; },
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
  useEffect: (effect: () => unknown) => { harness.effects.push(effect); },
}));
vi.mock('@excalidraw/excalidraw', () => ({ Excalidraw: 'excalidraw', MainMenu: { Item: 'item' }, WelcomeScreen: {} }));
vi.mock('../providers/WorkspaceContext', () => ({ useWorkspace: () => ({ resolvedTheme: 'dark' }) }));
vi.mock('@/components/diagram/DrawingCommentMarkers', () => ({ default: 'markers' }));
vi.mock('@/components/ui/button', () => ({ Button: 'button' }));
vi.mock('../lib/image-compression', () => ({ compressImage: vi.fn(async file => file) }));
vi.mock('../lib/api', () => ({ apiFetch: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

import ExcalidrawEditor from './ExcalidrawEditor';
import { apiFetch } from '../lib/api';
import { toast } from 'sonner';

function findEditor(node: any): any {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'excalidraw') return node.props;
  for (const child of [node.props?.children].flat(Infinity)) {
    const found = findEditor(child);
    if (found) return found;
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  harness.effects = [];
  harness.refs = [];
  harness.state = 0;
  vi.stubGlobal('window', {});
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => setTimeout(callback, 16));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  vi.stubGlobal('fetch', vi.fn(async () => ({ blob: async () => new Blob(['png'], { type: 'image/png' }) })));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

async function setup() {
  const files = { image: { id: 'image', mimeType: 'image/png', dataURL: 'data:image/png;base64,cG5n', created: 1 } };
  const elements = [{ id: 'shape', type: 'image', fileId: 'image' }];
  const appState = { theme: 'dark', collaborators: new Map() };
  harness.api = { getSceneElements: () => elements, getAppState: () => appState, getFiles: () => files };
  const onChange = vi.fn();
  const editor = findEditor(ExcalidrawEditor({ drawing: { id: 1, uid: 'drawing-qa', data: '[]' } as any, onSave: vi.fn(), onChange, onDelete: vi.fn(), compact: true }));
  harness.effects.forEach(effect => effect());
  await vi.advanceTimersByTimeAsync(501);
  editor.onChange(elements, appState, files);
  await vi.advanceTimersByTimeAsync(501);
  return { editor, onChange, files, elements, appState };
}

it('uploads the first image and persists its private URL without another canvas change', async () => {
  vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ url: '/api/serve/erd-builder-pro/team/qa/drawings/image.png' })));
  const { onChange, files } = await setup();
  expect(apiFetch).toHaveBeenCalledTimes(1);
  const form = vi.mocked(apiFetch).mock.calls[0][1]?.body as FormData;
  expect(form.get('feature')).toBe('drawings');
  expect(form.get('document')).toBe('drawing-qa');
  expect(await (form.get('image') as File).text()).toBe('png');
  expect(fetch).not.toHaveBeenCalled();
  const saved = JSON.parse(onChange.mock.lastCall![0]);
  expect(saved.files.image.dataURL).toBe('/api/serve/erd-builder-pro/team/qa/drawings/image.png');
  expect(files.image.dataURL).toMatch(/^data:image/);
});

it('preserves the inline image on upload failure and retries on the next canvas change', async () => {
  vi.mocked(apiFetch).mockImplementation(async () => new Response(JSON.stringify({ error: 'Storage unavailable' }), { status: 503 }));
  const { editor, onChange, files, elements, appState } = await setup();
  expect(toast.error).toHaveBeenCalledWith('Failed to upload image: Storage unavailable');
  expect(JSON.parse(onChange.mock.lastCall![0]).files.image.dataURL).toMatch(/^data:image/);
  vi.mocked(apiFetch).mockImplementation(async () => new Response(JSON.stringify({ url: '/api/serve/retried.png' })));
  editor.onChange(elements, appState, files);
  await vi.advanceTimersByTimeAsync(501);
  expect(apiFetch).toHaveBeenCalledTimes(2);
  expect(JSON.parse(onChange.mock.lastCall![0]).files.image.dataURL).toBe('/api/serve/retried.png');
});

it('keeps native Desktop images inline without uploading', async () => {
  vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
  const { onChange } = await setup();
  expect(apiFetch).not.toHaveBeenCalled();
  expect(JSON.parse(onChange.mock.lastCall![0]).files.image.dataURL).toMatch(/^data:image/);
});

it('does not re-upload when autosave resets the processed-file set', async () => {
  vi.mocked(apiFetch).mockImplementation(async () => new Response(JSON.stringify({ url: '/api/serve/saved.png' })));
  const { editor, files, elements, appState } = await setup();
  harness.refs.find(ref => ref.current instanceof Set).current = new Set();
  editor.onChange(elements, appState, files);
  await vi.advanceTimersByTimeAsync(501);
  expect(apiFetch).toHaveBeenCalledTimes(1);
});

it('uploads an image added while the first upload is in flight', async () => {
  let finish!: (response: Response) => void;
  const first = new Promise<Response>(resolve => { finish = resolve; });
  vi.mocked(apiFetch).mockImplementationOnce(() => first)
    .mockImplementation(async () => new Response(JSON.stringify({ url: '/api/serve/second.png' })));
  const { editor, onChange, files, elements, appState } = await setup();
  Object.assign(files, { second: { ...files.image, id: 'second' } });
  elements.push({ id: 'second-shape', type: 'image', fileId: 'second' });
  editor.onChange(elements, appState, files);
  finish(new Response(JSON.stringify({ url: '/api/serve/first.png' })));
  await vi.advanceTimersByTimeAsync(600);
  expect(apiFetch).toHaveBeenCalledTimes(2);
  const saved = JSON.parse(onChange.mock.lastCall![0]);
  expect(saved.elements).toHaveLength(2);
  expect(saved.files.image.dataURL).toBe('/api/serve/first.png');
  expect(saved.files.second.dataURL).toBe('/api/serve/second.png');
});
