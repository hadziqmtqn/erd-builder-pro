import React, { useState, memo, useMemo, createContext, useContext } from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';
import { MessageSquare, Trash2 } from 'lucide-react';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { CommentMarker, OPEN_COMMENT_EVENT } from '@/components/diagram/ERDComments';
import { DEFAULT_FLOWCHART_COLOR } from './flowchart/flowchartColors';

export type FlowchartShape = 'rectangle' | 'oval' | 'diamond' | 'parallelogram' | 'database' | 'document' | 'cloud' | 'circle';

export interface FlowchartNodeData extends Record<string, unknown> {
  label: string;
  shape: FlowchartShape;
  color: string;
  section?: string;
  groupId?: string;
  _commentsEnabled?: boolean;
  /** View-only file: no resize handles (DATA-004). */
  _readOnly?: boolean;
}

/** Actions the canvas offers from a symbol's context menu; absent on view-only canvases. */
export const FlowchartNodeActions = createContext<{ requestDelete?: (id: string) => void }>({});

const FlowchartNode = ({ data, id, selected }: { data: FlowchartNodeData, id: string, selected?: boolean }) => {
  const [isHovered, setIsHovered] = useState(false);
  const { requestDelete } = useContext(FlowchartNodeActions);
  const displayColor = !data.color || data.color === DEFAULT_FLOWCHART_COLOR
    ? 'var(--flowchart-node-border)'
    : data.color;
  
  const handleClasses = "!w-1.5 !h-1.5 !bg-[var(--flowchart-node-handle)] !border-none opacity-0 group-hover:opacity-100 transition-opacity z-20 cursor-crosshair";

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
    const baseStyle: React.CSSProperties = {
      background: 'var(--flowchart-node-fill)',
      borderColor: displayColor,
      borderWidth: '1.5px',
      borderStyle: 'solid',
      boxShadow: 'none',
      transition: 'border-color 150ms ease, background-color 150ms ease',
    };

    const svgFill = 'var(--flowchart-node-fill)';
    const svgStroke = displayColor;
    const svgStrokeWidth = '1.5';

    const pathStyle: React.CSSProperties = {
      filter: 'none',
      transition: 'stroke 150ms ease, fill 150ms ease',
    };

    switch (data.shape) {
      case 'diamond':
        return (
          <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
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
            style={baseStyle}
          />
        );
      case 'database':
        return (
          <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path 
              d="M2,15 L2,85 C2,95 98,95 98,85 L98,15" 
              fill={svgFill} 
              stroke={svgStroke} 
              strokeWidth={svgStrokeWidth} 
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              style={pathStyle}
            />
            <path 
              d="M2,15 C2,5 98,5 98,15 C98,25 2,25 2,15 Z" 
              fill="var(--flowchart-node-fill-muted)"
              stroke={svgStroke} 
              strokeWidth={svgStrokeWidth} 
              vectorEffect="non-scaling-stroke"
            />
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
  }, [data.shape, displayColor]);

  const content = (
    <div 
      className={`relative group flex h-full w-full items-center justify-center cursor-pointer ${containerClasses}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ aspectRatio: data.shape === 'circle' ? '1 / 1' : 'auto' }}
    >
      <NodeResizer 
        isVisible={!data._readOnly && (selected || isHovered)} 
        keepAspectRatio={data.shape === 'circle'}
        minWidth={minDimensions.width}
        minHeight={minDimensions.height}
        handleStyle={{ 
          width: 8, 
          height: 8, 
          borderRadius: 0, 
          backgroundColor: 'var(--flowchart-node-handle)',
          border: `1.5px solid ${displayColor}`,
          zIndex: 50
        }}
        lineStyle={{ border: `1px dashed ${displayColor}` }}
      />
      
      {/* Background Shape */}
      {shapeBackground}

      {/* Above the resize handles (z-50) that share this corner, or they take the click and open Symbol Properties. */}
      {data._commentsEnabled && <div className="absolute -right-2 -top-2 z-60">
        <CommentMarker anchor={{ type: 'shape', id }} />
      </div>}

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
      <div className="relative z-10 text-center text-sm font-semibold text-foreground wrap-break-word whitespace-pre-wrap max-w-full flex-1">
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

  if (!data._commentsEnabled && !requestDelete) return content;

  return (
    <ContextMenu>
      <ContextMenuTrigger className="contents">{content}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-36" positionerClassName="z-[210]">
        {data._commentsEnabled && (
          <ContextMenuItem onClick={(e) => {
            // The menu is portaled, but React still bubbles the click to the node, which would open Symbol Properties.
            e.preventDefault();
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent(OPEN_COMMENT_EVENT, { detail: { type: "shape", id } }));
          }}>
            <MessageSquare aria-hidden="true" />
            Comment
          </ContextMenuItem>
        )}
        {requestDelete && (
          <ContextMenuItem variant="destructive" onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            requestDelete(id);
          }}>
            <Trash2 aria-hidden="true" />
            Delete
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
};

export default memo(FlowchartNode);
