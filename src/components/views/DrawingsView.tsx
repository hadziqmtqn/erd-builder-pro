import React from 'react';
import ExcalidrawEditor from '../ExcalidrawEditor';

interface DrawingsViewProps {
  activeDrawingId: number | string | null;
  activeDrawing: any;
  saveDrawing: (drawing: any) => Promise<boolean | void>;
  handleDrawingChange: (data: string) => void;
  deleteDrawing: (id: number | string) => Promise<void>;
  isReadOnly?: boolean;
}

export const DrawingsView = React.memo(({
  activeDrawingId,
  activeDrawing,
  saveDrawing,
  handleDrawingChange,
  deleteDrawing,
  isReadOnly = false
}: DrawingsViewProps) => {
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
