import React from 'react';
import { Loader2 } from 'lucide-react';
import ExcalidrawEditor from '../ExcalidrawEditor';

interface DrawingsViewProps {
  activeDrawingId: number | string | null;
  activeDrawing: any;
  saveDrawing: (drawing: any) => Promise<boolean | void>;
  handleDrawingChange: (data: string) => void;
  deleteDrawing: (id: number | string) => Promise<void>;
  isReadOnly?: boolean;
  isLoading?: boolean;
}

export const DrawingsView = React.memo(({
  activeDrawingId,
  activeDrawing,
  saveDrawing,
  handleDrawingChange,
  deleteDrawing,
  isReadOnly = false,
  isLoading = false
}: DrawingsViewProps) => {
  // Only show full loader if we are loading AND don't have the drawing data yet.
  const showLoader = isLoading && !activeDrawing;

  if (showLoader) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center border rounded-xl bg-muted/10">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
        <p className="mt-4 text-sm font-medium text-muted-foreground animate-pulse">Opening drawing...</p>
      </div>
    );
  }


  if (!activeDrawing) return null;

  return (
    <div className="flex-1 border rounded-xl overflow-hidden bg-background">
      <ExcalidrawEditor 
        key={activeDrawingId} 
        drawing={activeDrawing} 
        onSave={saveDrawing} 
        onChange={handleDrawingChange} 
        onDelete={deleteDrawing} 
        isReadOnly={isReadOnly}
      />
    </div>
  );
});
