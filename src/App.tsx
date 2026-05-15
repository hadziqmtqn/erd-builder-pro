import { Routes, Route } from 'react-router-dom';

// Components
import { Login } from './components/Login';
import { ForbiddenView } from './components/views/ForbiddenView';
import { AppInitialization } from './components/layout/AppInitialization';
import { SettingsModal } from './components/modals/SettingsModal';

// Hooks
import { useAuth } from './hooks/useAuth';
import { usePublicDocument } from './hooks/usePublicDocument';

// Lib & Types
import { getSharePathInfo } from './lib/urlUtils';

// Providers
import { WorkspaceProvider } from './providers/WorkspaceProvider';

// Routes
import { AppLayout } from './routes/AppLayout';
import { TableRoute } from './routes/TableRoute';
import { NoteEditorRoute } from './routes/NoteEditorRoute';
import { DiagramEditorRoute } from './routes/DiagramEditorRoute';
import { DrawingEditorRoute } from './routes/DrawingEditorRoute';
import { FlowchartEditorRoute } from './routes/FlowchartEditorRoute';
import { AdminRoute } from './routes/AdminRoute';
import { DashboardRoute } from './routes/DashboardRoute';
import { NotFoundRoute } from './routes/NotFoundRoute';

function AppContent() {
  const { isAuthenticated, isGuest, checkAuth, handleGuestLogin, handleLogout } = useAuth();
  const { isPublicView, setIsPublicView, publicData, isPublicLoading, forbiddenDoc, fetchPublicDocument } = usePublicDocument(() => {});

  const shareInfo = getSharePathInfo();

  // Auth loading
  if (isAuthenticated === null && !shareInfo) {
    return <AppInitialization type="init" />;
  }

  if (isPublicLoading) {
    return <AppInitialization type="public" />;
  }

  // Forbidden document
  if (forbiddenDoc) {
    return (
      <ForbiddenView
        title={forbiddenDoc.title}
        message={forbiddenDoc.message}
        statusCode={forbiddenDoc.status}
        documentUid={shareInfo?.uid}
        onSubmitToken={async (t: string) => {
          if (shareInfo) {
            const s = await fetchPublicDocument(shareInfo.type, shareInfo.uid, undefined, undefined, t);
            if (s) sessionStorage.setItem(`share_token_${shareInfo.uid}`, t);
            else throw new Error('Invalid token');
          }
        }}
        onReturn={() => (window.location.href = '/')}
      />
    );
  }

  // Login
  if (!isAuthenticated && !shareInfo) {
    return <Login onLogin={() => checkAuth()} onGuestLogin={handleGuestLogin} />;
  }

  // Main app
  return (
    <WorkspaceProvider
      isPublicView={isPublicView}
      publicData={publicData}
      isPublicLoading={isPublicLoading}
      forbiddenDoc={forbiddenDoc}
      fetchPublicDocument={fetchPublicDocument}
      setIsPublicView={setIsPublicView}
      handleLogout={handleLogout}
    >
      <Routes>
        <Route element={<AppLayout />}>
          {/* Table views */}
          <Route path="table/:feature" element={<TableRoute />} />

          {/* Document editors */}
          <Route path="notes/:id" element={<NoteEditorRoute />} />
          <Route path="diagrams/:id" element={<DiagramEditorRoute />} />
          <Route path="drawings/:id" element={<DrawingEditorRoute />} />
          <Route path="flowcharts/:id" element={<FlowchartEditorRoute />} />

          {/* Admin pages */}
          <Route path="trash" element={<AdminRoute />} />

          {/* Default: Dashboard */}
          <Route index element={<DashboardRoute />} />

          {/* 404 */}
          <Route path="*" element={<NotFoundRoute />} />
        </Route>
      </Routes>
      <SettingsModal />
    </WorkspaceProvider>
  );
}

export default function App() {
  return <AppContent />;
}
