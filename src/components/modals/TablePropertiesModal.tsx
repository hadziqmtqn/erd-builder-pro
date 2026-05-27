import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trash2 } from 'lucide-react';
import PropertiesPanel from '../PropertiesPanel';

interface TablePropertiesModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selectedEntity: any;
  handleEntityUpdate: (updatedEntity: any) => void;
  deleteEntity: (id: string) => void;
  setSelectedNodeId: (id: string | null) => void;
  setIsDeleteAlertOpen: (open: boolean) => void;
}

export const TablePropertiesModal: React.FC<TablePropertiesModalProps> = ({
  isOpen,
  onOpenChange,
  selectedEntity,
  handleEntityUpdate,
  deleteEntity,
  setSelectedNodeId,
  setIsDeleteAlertOpen,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent 
        className="sm:max-w-sm"
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <div className="flex items-center justify-between pr-8">
            <div className="space-y-1 text-left">
              <DialogTitle>Table Properties</DialogTitle>
              <DialogDescription>
                Customize your table name, theme, and column definitions.
              </DialogDescription>
            </div>
            <Button 
              variant="ghost"
              size="icon"
              onClick={() => setIsDeleteAlertOpen(true)}
              className="text-destructive hover:bg-destructive/10 -mr-2 shadow-none"
              title="Delete Table"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>
        
        <DialogBody className="p-0 overflow-hidden flex flex-col">
          <PropertiesPanel 
            selectedEntity={selectedEntity} 
            onUpdateEntity={handleEntityUpdate} 
            onDeleteEntity={(id) => {
              deleteEntity(id);
              setSelectedNodeId(null);
            }} 
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
};
