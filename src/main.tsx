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
  
  if (response.status === 401 && !isAuthRoute) {
    window.dispatchEvent(new Event('auth:unauthorized'));
  }
  
  return response;
};

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
