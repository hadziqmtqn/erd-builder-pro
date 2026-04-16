import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Excalidraw, MainMenu, WelcomeScreen } from "@excalidraw/excalidraw";
import { Drawing } from '../types';
import { compressImage } from '../lib/image-compression';

interface ExcalidrawEditorProps {
  drawing: Drawing;
  onSave: (drawing: Drawing) => void;
  onChange?: (data: string) => void;
  onDelete: (id: number) => void;
  isReadOnly?: boolean;
}

export default function ExcalidrawEditor({ drawing, onSave, onChange, onDelete, isReadOnly = false }: ExcalidrawEditorProps) {
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);
  const lastDataRef = useRef(drawing.data);
  const isReady = useRef(false);
  const drawingRef = useRef(drawing);
  const processedFileIds = useRef<Set<string>>(new Set());
  const fileUrlMap = useRef<Map<string, string>>(new Map()); // Maps fileId to R2 URL
  const isProcessingFiles = useRef(false); // Guard to prevent infinite loops
  const isMountedRef = useRef(true); // Track if component is mounted
  const lastChangeTimeRef = useRef(0); // Track last change time for debounce

  // Store callbacks in refs to prevent dependency cycles
  const onSaveRef = useRef(onSave);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onSaveRef.current = onSave;
    onChangeRef.current = onChange;
  }, [onSave, onChange]);

  // Keep drawingRef up to date
  useEffect(() => {
    drawingRef.current = drawing;
  }, [drawing]);

  // Helper to process and upload new files to R2
  const processNewFiles = useCallback(async (files: any) => {
    // Guard against infinite loops - don't process if already processing or unmounted
    if (!isMountedRef.current || isProcessingFiles.current || !excalidrawAPI || !files) return;

    const fileIds = Object.keys(files);
    const newFilesToProcess = fileIds.filter(id => 
      !processedFileIds.current.has(id) && 
      files[id].dataURL.startsWith('data:image/')
    );

    if (newFilesToProcess.length === 0) return;

    // Mark as processing immediately
    isProcessingFiles.current = true;
    newFilesToProcess.forEach(id => processedFileIds.current.add(id));

    try {
      const updatedFiles: any[] = [];

      for (const id of newFilesToProcess) {
        const fileData = files[id];
        
        // Convert base64 to File object
        let blob;
        try {
          const res = await fetch(fileData.dataURL);
          blob = await res.blob();
        } catch (e) {
          console.error(`Failed to fetch/decode dataURL for file ${id}:`, e);
          continue; // Skip this file to prevent component crash
        }
        
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
            // Sanitize URL - remove escaped newlines and trim whitespace
            const cleanUrl = result.url.replace(/\\n/g, '').replace(/\\r/g, '').trim();
            fileUrlMap.current.set(id, cleanUrl); // Cache the R2 URL
            updatedFiles.push({
              id,
              dataURL: cleanUrl,
              mimeType: fileData.mimeType,
              created: fileData.created,
              lastRetrieved: Date.now(),
            });
          }
        }
      }

      // Note: We intentionally do NOT call addFiles() here because it triggers
      // onChange again, causing an infinite loop. Instead, we just cache the R2 URLs
      // and let the next handleChange call sanitize the data.
      if (updatedFiles.length > 0) {
        console.log(`Queued ${updatedFiles.length} images for R2. URLs cached, will sanitize on next change.`);
      }
    } catch (err) {
      console.error("Failed to process Excalidraw files for R2:", err);
    } finally {
      // Always reset the processing flag
      isProcessingFiles.current = false;
    }
  }, [excalidrawAPI]);

  // Prepare initial data for the component mount
  const initialData = useMemo(() => {
    if (!drawing.data || drawing.data === '[]' || drawing.data === '') return null;
    try {
      const parsed = JSON.parse(drawing.data);
      const { collaborators, ...safeAppState } = parsed.appState || {};
      
      // Seed processedFileIds and fileUrlMap with existing IDs to avoid re-uploading
      // Also sanitize URLs to fix any whitespace/newline issues
      const filesObject = parsed.files || {};
      const sanitizedFiles: any = {};
      
      if (filesObject) {
        Object.keys(filesObject).forEach(id => {
          const file = filesObject[id];
          if (file && typeof file.dataURL === 'string') {
            // Sanitize URL - remove escaped newlines and trim whitespace
            // JSON stores \n as literal characters, not actual newlines
            let cleanUrl = file.dataURL.replace(/\\n/g, '').replace(/\\r/g, '').trim();
            
            if (!cleanUrl.startsWith('data:image/')) {
              processedFileIds.current.add(id);
              fileUrlMap.current.set(id, cleanUrl);
            }
            
            // Keep sanitized file
            sanitizedFiles[id] = { ...file, dataURL: cleanUrl };
          }
        });
      }

      return {
        elements: parsed.elements || [],
        appState: { ...safeAppState, theme: 'dark' },
        files: sanitizedFiles,
      };
    } catch (e) {
      console.error("Failed to parse initial drawing data", e);
      return null;
    }
  }, [drawing.id]);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    // Reset state on mount
    isMountedRef.current = true;
    isReady.current = false;
    lastDataRef.current = drawing.data;
    processedFileIds.current = new Set(); // Reset on drawing change
    console.log(`ExcalidrawEditor mounted for drawing: ${drawing.id}. Ready in 1500ms...`);

    // Mark as ready after a shorter delay
    timeoutId = setTimeout(() => {
      isReady.current = true;
      console.log(`ExcalidrawEditor for drawing ${drawing.id} is now READY.`);
    }, 500);

    return () => {
      isMountedRef.current = false;
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
        
        // Sanitize files map: Replace any Base64 with R2 URLs from our map if available
        const cleanFiles = { ...files };
        Object.keys(cleanFiles).forEach(id => {
          const mappedUrl = fileUrlMap.current.get(id);
          const currentFile = cleanFiles[id];
          if (mappedUrl && currentFile && typeof currentFile.dataURL === 'string' && currentFile.dataURL.startsWith('data:image/')) {
            // IMMUTABLE UPDATE: Clone the file object to avoid mutating live Excalidraw state
            cleanFiles[id] = { ...currentFile, dataURL: mappedUrl };
          }
        });

        const { collaborators, ...safeAppState } = appState;
        const data = JSON.stringify({ elements, appState: safeAppState, files: cleanFiles });
        
        if (data !== lastDataRef.current && data !== '{"elements":[],"appState":{"theme":"dark"},"files":{}}' && data !== '{"elements":[],"appState":{"theme":"light"},"files":{}}') {
          console.log("Saving drawing on unmount (sanitized)...");
          onSaveRef.current({ ...drawingRef.current, data });
        }
      }
    };
  }, [excalidrawAPI]); // Only depend on API

  const handleChange = useCallback((elements: readonly any[], appState: any, files: any) => {
    // Guard: Component unmounted
    if (!isMountedRef.current) return;
    
    // Debounce: Ignore changes that happen within 100ms of each other
    const now = Date.now();
    if (now - lastChangeTimeRef.current < 100) {
      return;
    }
    lastChangeTimeRef.current = now;

    // Only report changes if the scene is ready and we're not already processing files
    if (!isReady.current || isProcessingFiles.current) {
      return;
    }

    // Scan and upload any new base64 images to R2
    processNewFiles(files);

    // Sanitize files map: Replace any Base64 with R2 URLs from our map if available
    const cleanFiles = { ...files };
    let wasSanitized = false;
    Object.keys(cleanFiles).forEach(id => {
      const mappedUrl = fileUrlMap.current.get(id);
      const currentFile = cleanFiles[id];
      if (mappedUrl && currentFile && typeof currentFile.dataURL === 'string' && currentFile.dataURL.startsWith('data:image/')) {
        // IMMUTABLE UPDATE: Clone the file object to avoid mutating live Excalidraw state
        cleanFiles[id] = { ...currentFile, dataURL: mappedUrl };
        wasSanitized = true;
      }
    });
    
    // Clean up appState before stringifying
    const { collaborators, ...safeAppState } = appState;
    const data = JSON.stringify({ elements, appState: safeAppState, files: cleanFiles });
    
    // Safety check: If we're getting an empty state but we had data before, 
    // it's likely a race condition during unmount or tab switch.
    const isEmpty = !elements || elements.length === 0;
    const hadData = lastDataRef.current && 
                    lastDataRef.current !== '[]' && 
                    lastDataRef.current !== '' &&
                    lastDataRef.current !== '{"elements":[],"appState":{"theme":"dark"},"files":{}}' &&
                    lastDataRef.current !== '{"elements":[],"appState":{"theme":"light"},"files":{}}';
    
    if (isEmpty && hadData) {
      console.warn("Excalidraw reported empty state while we had data. Ignoring to prevent reset.");
      return;
    }

    // Only trigger parent update if data actually changed to avoid loops
    if (data !== lastDataRef.current || wasSanitized) {
      lastDataRef.current = data;
      if (onChangeRef.current) {
        onChangeRef.current(data);
      }
    }
  }, [processNewFiles]);

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
          viewModeEnabled={isReadOnly}
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
