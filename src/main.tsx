import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { ReactFlowProvider } from '@xyflow/react';
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import App from './App.tsx';
import './index.css';
import "@excalidraw/excalidraw/index.css";

// Global Fetch Interceptor to handle 401 Unauthorized globally
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  
  // Get URL string safely depending on the argument type passed to fetch
  const url = typeof args[0] === 'string' 
    ? args[0] 
    : (args[0] instanceof Request ? args[0].url : typeof args[0] === 'object' && 'href' in (args[0] as any) ? (args[0] as any).href : '');
    
  const isAuthRoute = url.includes('/api/login') || url.includes('/api/logout') || url.includes('/api/me');
  
  if (response.status === 401 && !isAuthRoute && navigator.onLine) {
    window.dispatchEvent(new Event('auth:unauthorized'));
  }
  
  return response;
};

// Register Service Worker for Offline Assets Caching
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((registrationError) => {
      // Keep only severe registration error logging or remove it too?
      // User asked to remove experiment logs, but keeping error logging is usually good practice.
      // However, to be thorough as requested:
      // console.error('SW registration failed: ', registrationError);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ReactFlowProvider>
      <TooltipProvider>
        <App />
        <Toaster position="top-center" />
      </TooltipProvider>
    </ReactFlowProvider>
  </StrictMode>,
);
