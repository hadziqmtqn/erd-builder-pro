import { lazy, memo, Suspense, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Outlet, Route, Routes, UNSAFE_NavigationContext } from 'react-router-dom';
import { ReactFlowProvider } from '@xyflow/react';
import { WorkspaceProvider, useWorkspace } from '@/providers/WorkspaceProvider';
import { WorkspaceContext, type WorkspaceContextValue } from '@/providers/WorkspaceContext';
import { AIActionProvider, useAIAction, type AIActionContextValue } from '@/contexts/AIActionContext';
import { useSettledERDCanvas, type ERDCanvasContextValue } from '@/contexts/ERDCanvasContext';
import { FileSessionContext, type FileSessionScope } from '@/contexts/FileSessionContext';
import { CloudFeatureRoute } from '@/components/CloudFeatureRoute';
import { paneKey, paneUrl, type PaneFile } from '@/lib/file-panes';
import { flushPaneFile } from '@/lib/pane-save';
import { FileSessionDiscussions } from './FileSessionDiscussions';
import { ReadOnlyFileNotice } from './ReadOnlyFileNotice';

const NoteEditorRoute = lazy(() => import('@/routes/NoteEditorRoute').then(m => ({ default: m.NoteEditorRoute })));
const DiagramEditorRoute = lazy(() => import('@/routes/DiagramEditorRoute').then(m => ({ default: m.DiagramEditorRoute })));
const FlowchartEditorRoute = lazy(() => import('@/routes/FlowchartEditorRoute').then(m => ({ default: m.FlowchartEditorRoute })));
const DrawingEditorRoute = lazy(() => import('@/routes/DrawingEditorRoute').then(m => ({ default: m.DrawingEditorRoute })));

export type FileSession = { file: PaneFile; scope: FileSessionScope; workspace: WorkspaceContextValue; ai: AIActionContextValue; canvas: ERDCanvasContextValue; flush: () => Promise<void> };

function SessionPublisher({ file, scope, root, discussionTarget, onUpdate, teamState }: {
  file: PaneFile; scope: FileSessionScope; root: WorkspaceContextValue; discussionTarget: HTMLElement | null; onUpdate: (key: string, session: FileSession) => void; teamState: unknown;
}) {
  const local = useWorkspace();
  const workspace = useMemo(() => ({ ...local, theme: root.theme, resolvedTheme: root.resolvedTheme, setTheme: root.setTheme,
    setIsSettingsOpen: root.setIsSettingsOpen, setSettingsTab: root.setSettingsTab,
  }), [local, root.theme, root.resolvedTheme, root.setTheme, root.setIsSettingsOpen, root.setSettingsTab]);
  const ai = useAIAction();
  const canvas = useSettledERDCanvas();
  const latest = useRef(workspace);
  const previewApplied = useRef<PaneFile | null>(null);
  latest.current = workspace;
  const flush = useMemo(() => () => flushPaneFile(latest.current, scope.host.current ?? document), [scope]);
  useEffect(() => { onUpdate(paneKey(file), { file, scope, workspace, ai, canvas, flush }); }, [file, scope, workspace, ai, canvas, flush, onUpdate]);
  useEffect(() => {
    if (!file.previewSchema || previewApplied.current === file || workspace.isERDItemLoading || !workspace.activeDiagram || workspace.isReadOnlyFile(workspace.activeDiagram)) return;
    if (ai.applyContent(file.previewSchema, 'append', 'erd-generate-sql')) previewApplied.current = file;
  }, [file.previewSchema, workspace.isERDItemLoading, Boolean(workspace.activeDiagram), ai.applyContent]);
  return <WorkspaceContext.Provider value={workspace}>
    <FileSessionDiscussions file={file} active={scope.active.current} target={discussionTarget} teamId={(teamState as { activeTeamId?: string | null })?.activeTeamId} />
    <ReadOnlyFileNotice />
    <Suspense fallback={<div role="status" className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading editor…</div>}><Outlet context={teamState} /></Suspense>
  </WorkspaceContext.Provider>;
}

export const NativeFileSession = memo(function NativeFileSession({ file, active, scope, root, mainAI, teamState, discussionTarget, onUpdate, onNavigate }: {
  file: PaneFile; active: boolean; scope: FileSessionScope; root: WorkspaceContextValue; mainAI: AIActionContextValue; teamState: unknown; discussionTarget: HTMLElement | null;
  onUpdate: (key: string, session: FileSession) => void; onNavigate: (url: string) => void;
}) {
  scope.active.current = active;
  const navigation = useContext(UNSAFE_NavigationContext);
  const navigationRef = useRef(onNavigate);
  navigationRef.current = onNavigate;
  const router = useMemo(() => ({ ...navigation, navigator: {
    ...navigation.navigator,
    push: (to: Parameters<typeof navigation.navigator.push>[0]) => navigationRef.current(typeof to === 'string' ? to : `${to.pathname ?? ''}${to.search ?? ''}`),
    replace: (to: Parameters<typeof navigation.navigator.replace>[0]) => {
      const url = typeof to === 'string' ? to : `${to.pathname ?? ''}${to.search ?? ''}`;
      if (url.split('?')[0] !== paneUrl(file).split('?')[0]) navigationRef.current(url);
    },
  } }), [navigation, file.type, file.uid]);
  const wrap = (children: ReactNode) => <ReactFlowProvider><WorkspaceProvider isPublicView={false} publicData={null} isPublicLoading={false} forbiddenDoc={null}
    fetchPublicDocument={undefined} setIsPublicView={root.setIsPublicView} handleLogout={async () => { await root.handleLogout(); }}>
    <AIActionProvider panelMode={mainAI.rightPanelMode} onPanelModeChange={mainAI.setRightPanelMode}>{children}</AIActionProvider>
  </WorkspaceProvider></ReactFlowProvider>;
  return <FileSessionContext.Provider value={scope}><UNSAFE_NavigationContext.Provider value={router}>
    <Routes location={paneUrl(file)}>
      <Route element={wrap(<SessionPublisher file={file} scope={scope} root={root} discussionTarget={discussionTarget} onUpdate={onUpdate} teamState={teamState} />)}>
        <Route path="notes/:id" element={<CloudFeatureRoute capability="notes"><NoteEditorRoute /></CloudFeatureRoute>} />
        <Route path="diagrams/:id" element={<CloudFeatureRoute capability="erd_builder"><DiagramEditorRoute /></CloudFeatureRoute>} />
        <Route path="flowcharts/:id" element={<CloudFeatureRoute capability="flowcharts"><FlowchartEditorRoute /></CloudFeatureRoute>} />
        <Route path="drawings/:id" element={<CloudFeatureRoute capability="drawings"><DrawingEditorRoute /></CloudFeatureRoute>} />
      </Route>
    </Routes>
  </UNSAFE_NavigationContext.Provider></FileSessionContext.Provider>;
});
