import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Excalidraw, MainMenu, WelcomeScreen } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
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
  const isInitialLoad = useRef(true);

  useEffect(() => {
    setTitle(drawing.title);
    if (excalidrawAPI && drawing.data) {
      try {
        const parsed = JSON.parse(drawing.data);
        isInitialLoad.current = true;
        
        // Clean up appState to prevent crashes (e.g. collaborators must be a Map)
        const { collaborators, ...safeAppState } = parsed.appState || {};
        
        excalidrawAPI.updateScene({
          elements: parsed.elements || [],
          appState: { ...safeAppState, theme: 'dark' },
          files: parsed.files || {},
        });
        lastDataRef.current = drawing.data;
      } catch (e) {
        console.error("Failed to parse drawing data", e);
      }
    }
  }, [drawing.id, excalidrawAPI]);

  const handleChange = useCallback((elements: readonly any[], appState: any, files: any) => {
    // Skip the very first change if it's just the initial load
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return;
    }

    // Only save if there are elements or if it's not the initial empty state
    if (elements.length > 0 || (lastDataRef.current && lastDataRef.current !== '[]')) {
      // Clean up appState before stringifying (collaborators is a Map and doesn't serialize well)
      const { collaborators, ...safeAppState } = appState;
      const data = JSON.stringify({ elements, appState: safeAppState, files });
      
      // Only trigger parent update if data actually changed to avoid loops
      if (data !== lastDataRef.current) {
        lastDataRef.current = data;
        if (onChange) {
          onChange(data);
        }
      }
    }
  }, [onChange]); // Only depend on onChange

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
