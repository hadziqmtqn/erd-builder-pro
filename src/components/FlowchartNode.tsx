import React, { useState } from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';

export type FlowchartShape = 'rectangle' | 'oval' | 'diamond' | 'parallelogram' | 'database' | 'document' | 'cloud' | 'circle';

export interface FlowchartNodeData extends Record<string, unknown> {
  label: string;
  shape: FlowchartShape;
  color: string;
}

export default function FlowchartNode({ data, selected }: { data: FlowchartNodeData, selected?: boolean }) {
  const [isHovered, setIsHovered] = useState(false);
  
  const handleClasses = "!w-1.5 !h-1.5 !bg-white !border-none opacity-0 group-hover:opacity-100 transition-opacity z-20";

  // Different padding/width based on shape to ensure text doesn't overflow
  const getContainerClasses = (shape: FlowchartShape) => {
    switch (shape) {
      case 'diamond':
        return 'min-w-[130px] min-h-[130px] p-8';
      case 'circle':
        return 'min-w-[110px] min-h-[110px] p-4';
      case 'cloud':
        return 'min-w-[160px] max-w-[240px] min-h-[90px] px-10 py-6';
      case 'database':
        return 'min-w-[140px] max-w-[220px] min-h-[100px] px-6 pt-10 pb-6';
      case 'parallelogram':
        return 'min-w-[160px] max-w-[240px] min-h-[80px] px-12 py-4';
      case 'oval':
        return 'min-w-[140px] max-w-[240px] min-h-[80px] px-10 py-4';
      case 'document':
        return 'min-w-[140px] max-w-[220px] min-h-[90px] px-8 pt-4 pb-10';
      case 'rectangle':
      default:
        return 'min-w-[140px] max-w-[240px] min-h-[80px] px-8 py-4';
    }
  };

  const getMinDimensions = (shape: FlowchartShape) => {
    switch (shape) {
      case 'diamond': return { width: 100, height: 100 };
      case 'circle': return { width: 80, height: 80 };
      default: return { width: 100, height: 60 };
    }
  };

  const getShapeBackground = () => {
    const baseStyle: React.CSSProperties = {
      background: `linear-gradient(135deg, ${data.color}25 0%, ${data.color}10 100%)`,
      borderColor: data.color,
      borderWidth: '2px',
      borderStyle: 'solid',
      boxShadow: selected ? `0 0 20px ${data.color}60` : `0 4px 10px rgba(0,0,0,0.3)`,
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    };

    const svgFill = `${data.color}20`;
    const svgStroke = data.color;

    switch (data.shape) {
      case 'diamond':
        return (
          <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path 
              d="M50,2 L98,50 L50,98 L2,50 Z" 
              fill={svgFill} 
              stroke={svgStroke} 
              strokeWidth="2" 
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
            />
          </svg>
        );
      case 'parallelogram':
        return (
          <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path 
              d="M20,2 L98,2 L80,98 L2,98 Z" 
              fill={svgFill} 
              stroke={svgStroke} 
              strokeWidth="2" 
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
            />
          </svg>
        );
      case 'oval':
        return <div className="absolute inset-0 rounded-[50px] pointer-events-none" style={baseStyle} />;
      case 'circle':
        return (
          <div 
            className="absolute inset-0 rounded-full pointer-events-none flex items-center justify-center" 
            style={{ 
              ...baseStyle,
              background: `radial-gradient(circle at 30% 30%, ${data.color}40 0%, ${data.color}10 100%)`
            }} 
          />
        );
      case 'database':
        return (
          <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
            {/* Body */}
            <path 
              d="M2,15 L2,85 C2,95 98,95 98,85 L98,15" 
              fill={svgFill} 
              stroke={svgStroke} 
              strokeWidth="2" 
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
            />
            {/* Top Cap */}
            <path 
              d="M2,15 C2,5 98,5 98,15 C98,25 2,25 2,15 Z" 
              fill={`${data.color}35`} 
              stroke={svgStroke} 
              strokeWidth="2" 
              vectorEffect="non-scaling-stroke"
            />
            {/* Middle decorative line for cylinder depth */}
            <path d="M2,50 C2,60 98,60 98,50" fill="none" stroke={svgStroke} strokeWidth="2" vectorEffect="non-scaling-stroke" opacity="0.3" />
          </svg>
        );
      case 'document':
        return (
          <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path 
              d="M2,2 L70,2 L98,30 L98,85 C98,93 90,98 85,98 L15,98 C7,98 2,93 2,85 Z" 
              fill={svgFill} 
              stroke={svgStroke} 
              strokeWidth="2" 
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round" 
            />
            {/* Dog-ear fold */}
            <path d="M70,2 V30 H98" fill="none" stroke={svgStroke} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </svg>
        );
      case 'cloud':
        return (
          <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path 
              d="M20,80 C5,80 5,60 15,50 C10,20 40,15 55,25 C65,5 95,10 95,40 C105,50 105,80 80,80 Z" 
              fill={svgFill} 
              stroke={svgStroke} 
              strokeWidth="2" 
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round" 
              strokeLinejoin="round" 
            />
          </svg>
        );
      case 'rectangle':
      default:
        return <div className="absolute inset-0 rounded-md pointer-events-none" style={baseStyle} />;
    }
  };


  return (
    <div 
      className={`relative group flex items-center justify-center cursor-pointer transition-all duration-300 hover:scale-[1.02] ${getContainerClasses(data.shape)}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ aspectRatio: data.shape === 'circle' ? '1 / 1' : 'auto' }}
    >
      <NodeResizer 
        isVisible={selected || isHovered} 
        keepAspectRatio={data.shape === 'circle'}
        minWidth={getMinDimensions(data.shape).width}
        minHeight={getMinDimensions(data.shape).height}
        handleStyle={{ 
          width: 8, 
          height: 8, 
          borderRadius: 0, 
          backgroundColor: '#0f0f14', 
          border: `1.5px solid ${data.color}`,
          zIndex: 50
        }}
        lineStyle={{ border: `1px dashed ${data.color}80` }}
      />
      
      {/* Background Shape */}
      {getShapeBackground()}

      {/* Universal Handles: All 4 directions support both incoming and outgoing connections */}
      <Handle id="top" type="target" position={Position.Top} className={handleClasses} />
      <Handle id="top" type="source" position={Position.Top} className={handleClasses} />
      
      <Handle id="bottom" type="target" position={Position.Bottom} className={handleClasses} />
      <Handle id="bottom" type="source" position={Position.Bottom} className={handleClasses} />
      
      <Handle id="right" type="target" position={Position.Right} className={handleClasses} />
      <Handle id="right" type="source" position={Position.Right} className={handleClasses} />
      
      <Handle id="left" type="target" position={Position.Left} className={handleClasses} />
      <Handle id="left" type="source" position={Position.Left} className={handleClasses} />
      
      {/* Label Container: breaks long text and restricts it from touching edges */}
      <div className="relative z-10 text-center text-sm font-semibold text-white break-words whitespace-pre-wrap max-w-full flex-1">
        {data.label}
      </div>
    </div>
  );
}
