import {StrictMode, useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ReactFlowProvider } from '@xyflow/react';
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import App from './App.tsx';
import { AuthProvider } from './hooks/useAuth';
import './index.css';
import "@excalidraw/excalidraw/index.css";
import { API_BASE_URL, clearAuthToken } from './lib/api';

// Detect Tauri and add data attribute for CSS targeting
if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
  document.body.setAttribute('data-tauri', 'true');
}

// Global Fetch Interceptor to handle 401 Unauthorized globally
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  
  // Get URL string safely depending on the argument type passed to fetch
  const url = typeof args[0] === 'string' 
    ? args[0] 
    : (args[0] instanceof Request ? args[0].url : typeof args[0] === 'object' && 'href' in (args[0] as Record<string, any>) ? (args[0] as Record<string, any>).href : '');
    
  const isAuthRoute = url.includes('/api/login') || url.includes('/api/logout') || url.includes('/api/me');
  const isSupabaseRoute = url.includes('supabase.co');
  const isApiRoute = (url.startsWith('/api/') || (API_BASE_URL && url.startsWith(API_BASE_URL))) && !url.includes('supabase.co');
  
  const isGuest = sessionStorage.getItem('auth_mode') === 'guest';
  
  if (response.status === 401 && isApiRoute && !isAuthRoute && navigator.onLine && !isGuest) {
    clearAuthToken();
    window.dispatchEvent(new Event('auth:unauthorized'));
  }
  
  return response;
};

// Register Service Worker for Offline Assets Caching (production only)
if ('serviceWorker' in navigator) {
  const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (isDev) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      registrations.forEach(r => r.unregister());
    });
  } else {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ReactFlowProvider>
        <TooltipProvider>
          <AuthProvider>
            <App />
            <Toaster position="top-center" />
          </AuthProvider>
        </TooltipProvider>
      </ReactFlowProvider>
    </BrowserRouter>
  </StrictMode>,
);
