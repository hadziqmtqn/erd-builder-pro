import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { ReactFlowProvider } from '@xyflow/react';
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import App from './App.tsx';
import './index.css';
import "@excalidraw/excalidraw/index.css";

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
