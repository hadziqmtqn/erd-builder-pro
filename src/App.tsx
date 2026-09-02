import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { lazy, Suspense, useRef, useEffect, useState, type ReactNode } from 'react';

// Components
import { Login } from './components/Login';
import { ForbiddenView } from './components/views/ForbiddenView';
import { AppInitialization } from './components/layout/AppInitialization';
import { SettingsModal } from './components/modals/SettingsModal';
import { AboutDialog } from './components/modals/AboutDialog';

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
import { NotFoundRoute } from './routes/NotFoundRoute';
import { DashboardRoute } from './routes/DashboardRoute';
import { OAuthConsent } from './components/OAuthConsent';

const NoteEditorRoute = lazy(() => import('./routes/NoteEditorRoute').then(module => ({ default: module.NoteEditorRoute })));
const DiagramEditorRoute = lazy(() => import('./routes/DiagramEditorRoute').then(module => ({ default: module.DiagramEditorRoute })));
const DbClientEditorRoute = lazy(() => import('./routes/DbClientEditorRoute').then(module => ({ default: module.DbClientEditorRoute })));
const DrawingEditorRoute = lazy(() => import('./routes/DrawingEditorRoute').then(module => ({ default: module.DrawingEditorRoute })));
const FlowchartEditorRoute = lazy(() => import('./routes/FlowchartEditorRoute').then(module => ({ default: module.FlowchartEditorRoute })));
const AdminRoute = lazy(() => import('./routes/AdminRoute').then(module => ({ default: module.AdminRoute })));

function lazyRoute(element: ReactNode) {
  return <Suspense fallback={<div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">Opening file…</div>}>{element}</Suspense>;
}

function AppContent() {
  const { isAuthenticated, isGuest, handleLogin, handleGuestLogin, handleLogout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [aboutOpen, setAboutOpen] = useState(false);

  // Listen for native macOS menu events (emitted from Rust via Tauri)
  useEffect(() => {
    let unlistenAbout: () => void;
    let unlistenCheckUpdate: () => void;

    const isTauri = typeof window !== 'undefined' &&
      !!((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__);

    if (!isTauri) return;

    const setup = async () => {
      const { listen } = await import('@tauri-apps/api/event');

      unlistenAbout = await listen<string>('menu-about', () => {
        setAboutOpen(true);
      });

      unlistenCheckUpdate = await listen<string>('menu-check-update', () => {
        window.dispatchEvent(new CustomEvent('menu-check-update', { detail: {} }));
      });
    };

    setup();

    return () => {
      unlistenAbout?.();
      unlistenCheckUpdate?.();
    };
  }, []);

  // When transitioning from unauthenticated → authenticated (user logs in),
  // navigate to dashboard to prevent stale URL from Guest mode or previous
  // session from restoring a file that doesn't exist in the new session.
  const wasUnauthenticatedRef = useRef(false);
  useEffect(() => {
    if (isAuthenticated === false) {
      wasUnauthenticatedRef.current = true;
    } else if (isAuthenticated === true && wasUnauthenticatedRef.current) {
      wasUnauthenticatedRef.current = false;
      if (location.pathname !== '/oauth/consent') navigate('/');
    }
  }, [isAuthenticated, location.pathname, navigate]);

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
    return (
      <Login
        onLogin={(userData?: any) => handleLogin(userData)}
        onGuestLogin={handleGuestLogin}
      />
    );
  }

  if (location.pathname === '/oauth/consent') {
    return <OAuthConsent />;
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
          <Route path="notes/:id" element={lazyRoute(<NoteEditorRoute />)} />
          <Route path="diagrams/:id" element={lazyRoute(<DiagramEditorRoute />)} />
          <Route path="db-client/:id" element={lazyRoute(<DbClientEditorRoute />)} />
          <Route path="drawings/:id" element={lazyRoute(<DrawingEditorRoute />)} />
          <Route path="flowcharts/:id" element={lazyRoute(<FlowchartEditorRoute />)} />

          {/* Admin pages */}
          <Route path="trash" element={lazyRoute(<AdminRoute />)} />

          {/* Default: Dashboard */}
          <Route index element={<DashboardRoute />} />

          {/* 404 */}
          <Route path="*" element={<NotFoundRoute />} />
        </Route>
      </Routes>
      <SettingsModal />
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
    </WorkspaceProvider>
  );
}

export default function App() {
  return <AppContent />;
}
