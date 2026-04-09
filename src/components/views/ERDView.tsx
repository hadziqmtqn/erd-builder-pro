import React from 'react';
import { 
  ReactFlow, 
  Background, 
  Controls, 
  BackgroundVariant,
  OnConnect,
  OnNodesChange,
  OnEdgesChange,
  Node,
  Edge
} from '@xyflow/react';
import { Plus, Download, ChevronDown, Database, Undo2, Redo2, Image as ImageIcon, FileCode, Upload, FileText } from 'lucide-react';



import { Button } from "@/components/ui/button";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuGroup
} from "@/components/ui/dropdown-menu";
import EntityNode from '../EntityNode';
import { Entity } from '@/types';

const nodeTypes = {
  entity: EntityNode,
};

interface ERDViewProps {
  nodes: Node<Entity>[];
  edges: Edge[];
  onNodesChange: OnNodesChange<Node<Entity>>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  onNodeClick: (event: React.MouseEvent, node: Node) => void;
  onEdgeClick?: (event: React.MouseEvent, edge: Edge) => void;
  onPaneClick: () => void;
  onMove: (event: any, viewport: any) => void;
  addEntity: () => void;
  openImportModal: () => void;
  handleExportSQL: (dialect: 'postgresql' | 'mysql') => void;

  handleExportPDF: () => void;
  isReadOnly?: boolean;

  undo?: () => void;
  redo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  takeSnapshot?: (nodes: Node<Entity>[], edges: Edge[]) => void;
}


import { JumpToNode } from '../JumpToNode';

export const ERDView = React.memo(({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeClick,
  onEdgeClick,
  onPaneClick,
  onMove,
  addEntity,
  openImportModal,
  handleExportSQL,

  handleExportPDF,
  isReadOnly = false,

  undo,
  redo,
  canUndo,
  canRedo,
  takeSnapshot
}: ERDViewProps) => {

  return (
    <div className="flex-1 relative flex flex-col overflow-hidden border rounded-xl bg-muted/20">
       {!isReadOnly && (
        <div className="absolute top-6 inset-x-0 z-10 flex justify-center pointer-events-none">
          <div className="flex items-center gap-1.5 p-1.5 bg-background/95 backdrop-blur-md border border-border/50 rounded-2xl shadow-2xl pointer-events-auto max-w-[95vw] overflow-x-auto no-scrollbar">
            <JumpToNode nodes={nodes} />
            
            <div className="w-px h-6 bg-border mx-0.5" />
            
            <Button onClick={addEntity} size="sm" className="h-9 px-3 sm:px-4 font-bold shadow-lg shadow-primary/20 cursor-pointer">
              <Plus className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Add Table</span>
            </Button>
            
            <Button onClick={openImportModal} variant="outline" size="sm" className="h-9 px-3 sm:px-4 font-bold text-muted-foreground border-border/50 hover:bg-muted/50">
              <Upload className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Import SQL</span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger render={
                <Button variant="ghost" size="sm" className="h-9 px-3 sm:px-4 font-bold text-muted-foreground hover:text-foreground">
                  <Download className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Export</span>
                  <ChevronDown className="w-3 h-3 ml-1 opacity-50" />
                </Button>
              } />
              <DropdownMenuContent align="end" className="w-48 p-1">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-2 py-1.5">SQL Format</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleExportSQL('postgresql')} className="flex items-center gap-3 px-3 py-2 text-xs font-semibold">
                    <Database size={14} className="text-blue-400" />
                    To PostgreSQL
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExportSQL('mysql')} className="flex items-center gap-3 px-3 py-2 text-xs font-semibold">
                    <Database size={14} className="text-orange-400" />
                    To MySQL
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-2 py-1.5">Visual Format</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleExportPDF()} className="flex items-center gap-3 px-3 py-2 text-xs font-semibold">
                    <FileText size={14} className="text-red-400" />
                    As PDF Document
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="w-px h-6 bg-border mx-0.5" />

            <div className="flex items-center gap-0.5 ml-auto">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={undo} 
                disabled={!canUndo}
                className="h-8 w-8 text-muted-foreground hover:text-foreground disabled:opacity-30"
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="w-4 h-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={redo} 
                disabled={!canRedo}
                className="h-8 w-8 text-muted-foreground hover:text-foreground disabled:opacity-30"
                title="Redo (Ctrl+Y)"
              >
                <Redo2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onPaneClick={onPaneClick}
          onMove={onMove}
          colorMode="dark"
          onlyRenderVisibleElements={true}
          nodesDraggable={!isReadOnly}
          nodesConnectable={!isReadOnly}
          elementsSelectable={!isReadOnly}
          onNodeDragStop={() => takeSnapshot && takeSnapshot(nodes, edges)}
        >

          <Background variant={BackgroundVariant.Lines} gap={50} size={1} color="#222" />
          <Controls position="bottom-left" showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
});
