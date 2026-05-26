import React, { useState, memo, useMemo } from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';

export type FlowchartShape = 'rectangle' | 'oval' | 'diamond' | 'parallelogram' | 'database' | 'document' | 'cloud' | 'circle';

export interface FlowchartNodeData extends Record<string, unknown> {
  label: string;
  shape: FlowchartShape;
  color: string;
  section?: string;
  groupId?: string;
  code?: string;
  isSimulationActive?: boolean;
  isSimulationVisited?: boolean;
}

const FlowchartNode = ({ data, selected }: { data: FlowchartNodeData, selected?: boolean }) => {
  const [isHovered, setIsHovered] = useState(false);
  
  const handleClasses = "!w-1.5 !h-1.5 !bg-white !border-none opacity-0 group-hover:opacity-100 transition-opacity z-20 cursor-crosshair";

  // Different padding/width based on shape to ensure text doesn't overflow
  const containerClasses = useMemo(() => {
    switch (data.shape) {
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
  }, [data.shape]);

  const minDimensions = useMemo(() => {
    switch (data.shape) {
      case 'diamond': return { width: 100, height: 100 };
      case 'circle': return { width: 80, height: 80 };
      default: return { width: 100, height: 60 };
    }
  }, [data.shape]);

  const shapeBackground = useMemo(() => {
    const isSimulationActive = data.isSimulationActive as boolean;
    const isSimulationVisited = data.isSimulationVisited as boolean;

    const baseStyle: React.CSSProperties = {
      background: isSimulationActive
        ? `linear-gradient(135deg, ${data.color}40 0%, ${data.color}20 100%)`
        : isSimulationVisited
          ? `linear-gradient(135deg, ${data.color}15 0%, ${data.color}05 100%)`
          : `linear-gradient(135deg, ${data.color}25 0%, ${data.color}10 100%)`,
      borderColor: isSimulationActive ? '#10b981' : isSimulationVisited ? '#059669' : data.color,
      borderWidth: isSimulationActive ? '3px' : '2px',
      borderStyle: 'solid',
      boxShadow: isSimulationActive
        ? '0 0 25px rgba(16, 185, 129, 0.8)'
        : isSimulationVisited
          ? '0 0 12px rgba(5, 150, 105, 0.4)'
          : selected
            ? `0 0 20px ${data.color}60`
            : `0 4px 10px rgba(0,0,0,0.3)`,
      animation: isSimulationActive ? 'pulse-green 1.8s infinite' : 'none',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      opacity: isSimulationActive ? 1 : isSimulationVisited ? 0.75 : 1,
    };

    const svgFill = isSimulationActive
      ? `rgba(16, 185, 129, 0.25)`
      : isSimulationVisited
        ? `${data.color}08`
        : `${data.color}20`;

    const svgStroke = isSimulationActive
      ? '#10b981'
      : isSimulationVisited
        ? '#059669'
        : data.color;

    const svgStrokeWidth = isSimulationActive ? '3' : '2';

    const pathStyle: React.CSSProperties = {
      filter: isSimulationActive
        ? 'drop-shadow(0 0 10px rgba(16, 185, 129, 0.8))'
        : isSimulationVisited
          ? 'drop-shadow(0 0 5px rgba(5, 150, 105, 0.3))'
          : 'none',
      transition: 'all 0.3s',
      animation: isSimulationActive ? 'pulse-green 1.8s infinite' : 'none',
    };

    switch (data.shape) {
      case 'diamond':
        return (
          <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible animate-pulse-sim" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path 
              d="M50,2 L98,50 L50,98 L2,50 Z" 
              fill={svgFill} 
              stroke={svgStroke} 
              strokeWidth={svgStrokeWidth} 
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              style={pathStyle}
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
              strokeWidth={svgStrokeWidth} 
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              style={pathStyle}
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
              background: isSimulationActive
                ? `radial-gradient(circle at 30% 30%, rgba(16, 185, 129, 0.45) 0%, rgba(16, 185, 129, 0.15) 100%)`
                : `radial-gradient(circle at 30% 30%, ${data.color}40 0%, ${data.color}10 100%)`
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
              strokeWidth={svgStrokeWidth} 
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              style={pathStyle}
            />
            {/* Top Cap */}
            <path 
              d="M2,15 C2,5 98,5 98,15 C98,25 2,25 2,15 Z" 
              fill={isSimulationActive ? 'rgba(16, 185, 129, 0.35)' : `${data.color}35`} 
              stroke={svgStroke} 
              strokeWidth={svgStrokeWidth} 
              vectorEffect="non-scaling-stroke"
            />
            {/* Middle decorative line for cylinder depth */}
            <path d="M2,50 C2,60 98,60 98,50" fill="none" stroke={svgStroke} strokeWidth={svgStrokeWidth} vectorEffect="non-scaling-stroke" opacity="0.3" />
          </svg>
        );
      case 'document':
        return (
          <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path 
              d="M2,2 L70,2 L98,30 L98,85 C98,93 90,98 85,98 L15,98 C7,98 2,93 2,85 Z" 
              fill={svgFill} 
              stroke={svgStroke} 
              strokeWidth={svgStrokeWidth} 
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round" 
              style={pathStyle}
            />
            {/* Dog-ear fold */}
            <path d="M70,2 V30 H98" fill="none" stroke={svgStroke} strokeWidth={svgStrokeWidth} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </svg>
        );
      case 'cloud':
        return (
          <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path 
              d="M20,80 C5,80 5,60 15,50 C10,20 40,15 55,25 C65,5 95,10 95,40 C105,50 105,80 80,80 Z" 
              fill={svgFill} 
              stroke={svgStroke} 
              strokeWidth={svgStrokeWidth} 
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round" 
              strokeLinejoin="round" 
              style={pathStyle}
            />
          </svg>
        );
      case 'rectangle':
      default:
        return <div className="absolute inset-0 rounded-md pointer-events-none" style={baseStyle} />;
    }
  }, [data.color, data.shape, selected, data.isSimulationActive, data.isSimulationVisited]);

  return (
    <div 
      className={`relative group flex items-center justify-center cursor-pointer transition-all duration-300 hover:scale-[1.02] ${containerClasses}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ aspectRatio: data.shape === 'circle' ? '1 / 1' : 'auto' }}
    >
      <NodeResizer 
        isVisible={selected || isHovered} 
        keepAspectRatio={data.shape === 'circle'}
        minWidth={minDimensions.width}
        minHeight={minDimensions.height}
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
      {shapeBackground}

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

      {/* Section/Group title badge for Start nodes */}
      {data.section && (
        <div className="absolute -top-7 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap text-[9px] font-medium text-muted-foreground/60 tracking-wider uppercase px-2 py-0.5 rounded-full bg-background/50 backdrop-blur-sm border border-border/30">
          {data.section}
        </div>
      )}
    </div>
  );
};

export default memo(FlowchartNode);
