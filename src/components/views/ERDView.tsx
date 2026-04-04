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
import { Plus, Download, ChevronDown, Database } from 'lucide-react';
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
  onPaneClick: () => void;
  onMove: (event: any, viewport: any) => void;
  addEntity: () => void;
  handleExportSQL: (dialect: 'postgresql' | 'mysql') => void;
}

export function ERDView({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeClick,
  onPaneClick,
  onMove,
  addEntity,
  handleExportSQL
}: ERDViewProps) {
  return (
    <div className="flex-1 relative flex flex-col overflow-hidden border rounded-xl bg-muted/20">
      <div className="absolute top-6 inset-x-0 z-10 flex justify-center pointer-events-none">
        <div className="flex items-center gap-2 p-1.5 bg-background/80 backdrop-blur-md border border-border/50 rounded-2xl shadow-2xl pointer-events-auto">
          <Button onClick={addEntity} size="sm" className="h-9 px-4 font-bold shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4 mr-2" />
            Add Table
          </Button>
          <div className="w-px h-6 bg-border mx-1" />
          <DropdownMenu>
            <DropdownMenuTrigger render={
              <Button variant="ghost" size="sm" className="h-9 px-4 font-bold text-muted-foreground hover:text-foreground">
                <Download className="w-4 h-4 mr-2" />
                Export
                <ChevronDown className="w-3 h-3 ml-1" />
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
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onMove={onMove}
          colorMode="dark"
        >
          <Background variant={BackgroundVariant.Dots} gap={30} size={1.5} color="#444" />
          <Controls position="bottom-right" showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}
