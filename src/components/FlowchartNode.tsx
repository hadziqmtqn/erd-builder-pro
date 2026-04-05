import React from 'react';
import { Handle, Position } from '@xyflow/react';

export type FlowchartShape = 'rectangle' | 'oval' | 'diamond' | 'parallelogram';

export interface FlowchartNodeData extends Record<string, unknown> {
  label: string;
  shape: FlowchartShape;
  color: string;
}

export default function FlowchartNode({ data, selected }: { data: FlowchartNodeData, selected?: boolean }) {
  
  const handleClasses = "!w-1.5 !h-1.5 !bg-white !border-none opacity-0 group-hover:opacity-100 transition-opacity z-20";

  // Different padding/width based on shape to ensure text doesn't overflow
  const getContainerClasses = (shape: FlowchartShape) => {
    switch (shape) {
      case 'diamond':
        // Diamond needs aspect-square and more padding so text stays in the middle
        return 'w-[140px] h-[140px] p-6';
      case 'parallelogram':
        return 'min-w-[160px] max-w-[220px] min-h-[60px] px-10 py-4';
      case 'oval':
        return 'min-w-[140px] max-w-[220px] min-h-[60px] px-8 py-4';
      case 'rectangle':
      default:
        return 'min-w-[140px] max-w-[220px] min-h-[60px] px-6 py-4';
    }
  };

  const getShapeBackground = () => {
    const baseStyle: React.CSSProperties = {
      backgroundColor: `${data.color}20`,
      borderColor: data.color,
      borderWidth: '2px',
      borderStyle: 'solid',
      boxShadow: selected ? `0 0 15px ${data.color}60` : `none`,
      transition: 'all 0.2s ease',
    };

    switch (data.shape) {
      case 'diamond':
        // scale to perfectly fit bounding box without cutting bounding edges
        return <div className="absolute inset-0 rounded-sm pointer-events-none" style={{ ...baseStyle, transform: 'rotate(45deg) scale(0.7071)' }} />;
      case 'parallelogram':
        return <div className="absolute inset-0 rounded-sm pointer-events-none" style={{ ...baseStyle, transform: 'skewX(-15deg)' }} />;
      case 'oval':
        return <div className="absolute inset-0 rounded-[50px] pointer-events-none" style={baseStyle} />;
      case 'rectangle':
      default:
        return <div className="absolute inset-0 rounded-md pointer-events-none" style={baseStyle} />;
    }
  };

  return (
    <div className={`relative group flex items-center justify-center cursor-pointer ${getContainerClasses(data.shape)}`}>
      
      {/* Background Shape */}
      {getShapeBackground()}

      {/* Universal Handles: All 4 directions support both incoming and outgoing connections */}
      <Handle id="top-t" type="target" position={Position.Top} className={handleClasses} />
      <Handle id="top-s" type="source" position={Position.Top} className={handleClasses} />
      
      <Handle id="bottom-t" type="target" position={Position.Bottom} className={handleClasses} />
      <Handle id="bottom-s" type="source" position={Position.Bottom} className={handleClasses} />
      
      <Handle id="right-t" type="target" position={Position.Right} className={handleClasses} />
      <Handle id="right-s" type="source" position={Position.Right} className={handleClasses} />
      
      <Handle id="left-t" type="target" position={Position.Left} className={handleClasses} />
      <Handle id="left-s" type="source" position={Position.Left} className={handleClasses} />
      
      {/* Label Container: breaks long text and restricts it from touching edges */}
      <div className="relative z-10 text-center text-sm font-semibold text-white break-words whitespace-pre-wrap max-w-full flex-1">
        {data.label}
      </div>
    </div>
  );
}
