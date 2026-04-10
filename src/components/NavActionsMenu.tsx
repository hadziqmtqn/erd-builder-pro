import React from 'react';
import { 
  MoreHorizontal, 
  Share2, 
  Link2, 
  Trash2, 
  Edit2, 
  Copy, 
  Star,
  Clock,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface NavActionsMenuProps {
  onShare: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  isOnline: boolean;
  isPublicView?: boolean;
  isPublic?: boolean;
  activeFileUid?: string;
  documentType: 'erd' | 'notes' | 'drawings' | 'flowchart' | string;
}

export const NavActionsMenu = ({
  onShare,
  onRename,
  onDelete,
  onDuplicate,
  isOnline,
  isPublicView = false,
  isPublic = false,
  activeFileUid,
  documentType
}: NavActionsMenuProps) => {

  const handleCopyLink = () => {
    if (!activeFileUid) {
      toast.error("Document link not available");
      return;
    }
    
    const sharePath = documentType === 'flowchart' ? 'flowchart' : documentType;
    const url = `${window.location.origin}/share/${sharePath}/${activeFileUid}`;
    
    navigator.clipboard.writeText(url);
    toast.success("Public share link copied to clipboard");
  };

  return (
    <div className="flex items-center gap-1 sm:gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger render={
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 text-muted-foreground hover:bg-muted/80 hover:text-foreground hover:shadow-sm active:scale-95 transition-all duration-200"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        } />
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem 
            disabled={!isOnline} 
            onClick={onShare}
            className="gap-2 cursor-pointer"
          >
            <Share2 className="h-4 w-4 text-muted-foreground" />
            <span>Share Document</span>
          </DropdownMenuItem>
          
          {isPublic && (
            <DropdownMenuItem 
              disabled={!isOnline || isPublicView} 
              onClick={handleCopyLink}
              className="gap-2 cursor-pointer"
            >
              <Link2 className="h-4 w-4 text-muted-foreground" />
              <span>Copy Public Link</span>
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem 
            disabled={!isOnline || isPublicView} 
            onClick={onRename}
            className="gap-2 cursor-pointer"
          >
            <Edit2 className="h-4 w-4 text-muted-foreground" />
            <span>Rename Document</span>
          </DropdownMenuItem>

          <DropdownMenuItem 
            disabled={!isOnline || isPublicView} 
            onClick={onDuplicate}
            className="gap-2 opacity-50 cursor-not-allowed cursor-pointer"
          >
            <Copy className="h-4 w-4 text-muted-foreground" />
            <span>Duplicate (Coming Soon)</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem 
            disabled={!isOnline || isPublicView} 
            onClick={onDelete}
            className="gap-2 text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
          >
            <Trash2 className="h-4 w-4" />
            <span>Move to Trash</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
