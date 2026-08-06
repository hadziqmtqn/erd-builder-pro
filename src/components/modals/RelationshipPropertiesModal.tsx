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
}

export const RelationshipPropertiesModal: React.FC<RelationshipPropertiesModalProps> = ({
  isOpen,
  onOpenChange,
  selectedEdge,
  nodes,
  handleEdgeUpdate,
  handleEdgeFlip,
  deleteEdge,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Relationship Properties</DialogTitle>
          <DialogDescription>
            Set the cardinality and foreign key actions between these two tables.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <RelationshipPropertiesPanel 
            selectedEdge={selectedEdge} 
            nodes={nodes} 
            onUpdateEdge={handleEdgeUpdate} 
            onFlipEdge={handleEdgeFlip}
            onDeleteEdge={deleteEdge}
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
};
