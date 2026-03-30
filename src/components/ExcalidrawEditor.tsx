import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Excalidraw, MainMenu, WelcomeScreen } from "@excalidraw/excalidraw";
import { Save, Trash2 } from 'lucide-react';
import { Drawing } from '../types';
import ConfirmModal from './ConfirmModal';

interface ExcalidrawEditorProps {
  drawing: Drawing;
  onSave: (drawing: Drawing) => void;
  onChange?: (data: string) => void;
  onDelete: (id: number) => void;
}

export default function ExcalidrawEditor({ drawing, onSave, onChange, onDelete }: ExcalidrawEditorProps) {
  const [title, setTitle] = useState(drawing.title);
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const lastDataRef = useRef(drawing.data);
  const isReady = useRef(false);
  const drawingRef = useRef(drawing);

  // Keep drawingRef up to date
  useEffect(() => {
    drawingRef.current = drawing;
  }, [drawing]);

  // Prepare initial data for the component mount
  const initialData = useMemo(() => {
    if (!drawing.data || drawing.data === '[]' || drawing.data === '') return null;
    try {
      const parsed = JSON.parse(drawing.data);
      const { collaborators, ...safeAppState } = parsed.appState || {};
      return {
        elements: parsed.elements || [],
        appState: { ...safeAppState, theme: 'dark' },
        files: parsed.files || {},
      };
    } catch (e) {
      console.error("Failed to parse initial drawing data", e);
      return null;
    }
  }, [drawing.id]);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    setTitle(drawing.title);
    
    // Reset ready state on mount
    isReady.current = false;
    lastDataRef.current = drawing.data;
    console.log(`ExcalidrawEditor mounted for drawing: ${drawing.id}. Ready in 1500ms...`);

    // Mark as ready after a delay to allow Excalidraw to settle with initialData
    timeoutId = setTimeout(() => {
      isReady.current = true;
      console.log(`ExcalidrawEditor for drawing ${drawing.id} is now READY.`);
    }, 1500); // Increased delay for safety

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [drawing.id]);

  // Save on unmount if there are changes
  useEffect(() => {
    return () => {
      // Use refs to avoid dependencies that cause this to run on every prop change
      if (excalidrawAPI && isReady.current) {
        const elements = excalidrawAPI.getSceneElements();
        if (!elements || elements.length === 0) return; // Don't save empty on unmount if it was ready

        const appState = excalidrawAPI.getAppState();
        const files = excalidrawAPI.getFiles();
        const { collaborators, ...safeAppState } = appState;
        const data = JSON.stringify({ elements, appState: safeAppState, files });
        
        if (data !== lastDataRef.current && data !== '{"elements":[],"appState":{"theme":"dark"},"files":{}}') {
          console.log("Saving drawing on unmount...");
          onSave({ ...drawingRef.current, data });
        }
      }
    };
  }, [excalidrawAPI, onSave]); // Only depend on API and onSave

  const handleChange = useCallback((elements: readonly any[], appState: any, files: any) => {
    // Only report changes if the scene is ready
    if (!isReady.current) {
      return;
    }

    // Clean up appState before stringifying
    const { collaborators, ...safeAppState } = appState;
    const data = JSON.stringify({ elements, appState: safeAppState, files });
    
    // Safety check: If we're getting an empty state but we had data before, 
    // it's likely a race condition during unmount or tab switch.
    const isEmpty = !elements || elements.length === 0;
    const hadData = lastDataRef.current && 
                    lastDataRef.current !== '[]' && 
                    lastDataRef.current !== '' &&
                    lastDataRef.current !== '{"elements":[],"appState":{"theme":"dark"},"files":{}}';
    
    if (isEmpty && hadData) {
      console.warn("Excalidraw reported empty state while we had data. Ignoring to prevent reset.");
      return;
    }

    // Only trigger parent update if data actually changed to avoid loops
    if (data !== lastDataRef.current) {
      lastDataRef.current = data;
      if (onChange) {
        onChange(data);
      }
    }
  }, [onChange]);

  const uiOptions = useMemo(() => ({
    canvasActions: {
      toggleTheme: false,
      export: {
        saveFileToDisk: true,
      },
    },
  }), []);

  return (
    <div className="flex flex-col h-full bg-bg-primary text-text-primary overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-bg-secondary/50 backdrop-blur-sm z-20">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => onSave({ ...drawing, title })}
          className="text-xl font-bold bg-transparent border-none focus:outline-none w-full text-text-primary placeholder-text-secondary"
          placeholder="Drawing Title"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (excalidrawAPI) {
                const elements = excalidrawAPI.getSceneElements();
                const appState = excalidrawAPI.getAppState();
                const files = excalidrawAPI.getFiles();
                onSave({ ...drawing, title, data: JSON.stringify({ elements, appState, files }) });
              }
            }}
            className="flex items-center gap-2 px-4 py-1.5 text-xs font-bold bg-accent-primary hover:bg-accent-secondary text-white rounded-xl transition-all shadow-lg shadow-accent-primary/20"
          >
            <Save size={14} />
            Save
          </button>
          <button
            onClick={() => setIsConfirmOpen(true)}
            className="p-2 text-red-400 hover:bg-red-400/10 rounded-xl transition-all"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <ConfirmModal
        isOpen={isConfirmOpen}
        title="Delete Drawing"
        message={`Are you sure you want to move "${drawing.title}" to the trash?`}
        onConfirm={() => {
          onDelete(drawing.id);
          setIsConfirmOpen(false);
        }}
        onCancel={() => setIsConfirmOpen(false)}
      />

      {/* Excalidraw Area */}
      <div className="flex-1 relative">
        <Excalidraw
          excalidrawAPI={setExcalidrawAPI}
          initialData={initialData}
          onChange={handleChange}
          theme="dark"
          UIOptions={uiOptions}
        >
          <WelcomeScreen />
          <MainMenu>
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.DefaultItems.ChangeCanvasBackground />
            <MainMenu.DefaultItems.Export />
            <MainMenu.DefaultItems.Help />
          </MainMenu>
        </Excalidraw>
      </div>
    </div>
  );
}
