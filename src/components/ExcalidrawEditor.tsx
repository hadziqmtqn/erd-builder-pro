import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Excalidraw, MainMenu, WelcomeScreen } from "@excalidraw/excalidraw";
import { Drawing } from '../types';
import { compressImage } from '../lib/image-compression';

interface ExcalidrawEditorProps {
  drawing: Drawing;
  onSave: (drawing: Drawing) => void;
  onChange?: (data: string) => void;
  onDelete: (id: number) => void;
}

export default function ExcalidrawEditor({ drawing, onSave, onChange, onDelete }: ExcalidrawEditorProps) {
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);
  const lastDataRef = useRef(drawing.data);
  const isReady = useRef(false);
  const drawingRef = useRef(drawing);
  const processedFileIds = useRef<Set<string>>(new Set());

  // Keep drawingRef up to date
  useEffect(() => {
    drawingRef.current = drawing;
  }, [drawing]);

  // Helper to process and upload new files to R2
  const processNewFiles = useCallback(async (files: any) => {
    if (!excalidrawAPI || !files) return;

    const fileIds = Object.keys(files);
    const newFilesToProcess = fileIds.filter(id => 
      !processedFileIds.current.has(id) && 
      files[id].dataURL.startsWith('data:image/')
    );

    if (newFilesToProcess.length === 0) return;

    // Mark as processing immediately
    newFilesToProcess.forEach(id => processedFileIds.current.add(id));

    try {
      const updatedFiles: any[] = [];

      for (const id of newFilesToProcess) {
        const fileData = files[id];
        
        // Convert base64 to File object
        const res = await fetch(fileData.dataURL);
        const blob = await res.blob();
        const file = new File([blob], `excalidraw_${id}`, { type: fileData.mimeType });

        // Compress
        const compressedFile = await compressImage(file, { maxWidth: 1280, quality: 0.8 });

        // Upload to R2
        const formData = new FormData();
        formData.append('image', compressedFile);
        formData.append('feature', 'drawings');

        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });

        if (uploadRes.ok) {
          const result = await uploadRes.json();
          if (result.url) {
            updatedFiles.push({
              id,
              dataURL: result.url,
              mimeType: fileData.mimeType,
              created: fileData.created,
              lastRetrieved: Date.now(),
            });
          }
        }
      }

      if (updatedFiles.length > 0) {
        // Update Excalidraw's internal files map with R2 URLs
        excalidrawAPI.addFiles(updatedFiles);
        console.log(`Successfully moved ${updatedFiles.length} images to R2`);
      }
    } catch (err) {
      console.error("Failed to process Excalidraw files for R2:", err);
    }
  }, [excalidrawAPI]);

  // Prepare initial data for the component mount
  const initialData = useMemo(() => {
    if (!drawing.data || drawing.data === '[]' || drawing.data === '') return null;
    try {
      const parsed = JSON.parse(drawing.data);
      const { collaborators, ...safeAppState } = parsed.appState || {};
      
      // Seed processedFileIds with existing IDs to avoid re-uploading
      if (parsed.files) {
        Object.keys(parsed.files).forEach(id => {
          if (!parsed.files[id].dataURL.startsWith('data:image/')) {
            processedFileIds.current.add(id);
          }
        });
      }

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
    
    // Reset ready state on mount
    isReady.current = false;
    lastDataRef.current = drawing.data;
    processedFileIds.current = new Set(); // Reset on drawing change
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

    // Scan and upload any new base64 images to R2
    processNewFiles(files);

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
  }, [onChange, processNewFiles]);

  const uiOptions = useMemo(() => ({
    canvasActions: {
      toggleTheme: false,
      export: {
        saveFileToDisk: true,
      },
    },
  }), []);

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden">
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
