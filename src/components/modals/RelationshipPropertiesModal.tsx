import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
} from "@/components/ui/dialog";
import RelationshipPropertiesPanel from '../diagram/RelationshipPropertiesPanel';

interface RelationshipPropertiesModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selectedEdge: any;
  nodes: any[];
  handleEdgeUpdate: (edgeId: string, updatedData: string | { label?: string; data?: Record<string, any> }) => void;
  handleEdgeFlip: (edgeId: string) => void;
  deleteEdge: (edgeId: string) => void;
  moveOnly?: boolean;
}

export const RelationshipPropertiesModal: React.FC<RelationshipPropertiesModalProps> = ({
  isOpen,
  onOpenChange,
  selectedEdge,
  nodes,
  handleEdgeUpdate,
  handleEdgeFlip,
  deleteEdge,
  moveOnly = false,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{moveOnly ? 'Move Relationship Connector' : 'Relationship Properties'}</DialogTitle>
          {moveOnly ? (
            <DialogDescription>
              Move this connector without changing its related tables or columns.
            </DialogDescription>
          ) : (
            <DialogDescription>
              Set the cardinality and foreign key actions between these two tables.
            </DialogDescription>
          )}
        </DialogHeader>
        <DialogBody>
          <RelationshipPropertiesPanel 
            selectedEdge={selectedEdge} 
            nodes={nodes} 
            onUpdateEdge={handleEdgeUpdate} 
            onFlipEdge={handleEdgeFlip}
            onDeleteEdge={deleteEdge}
            moveOnly={moveOnly}
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
};
