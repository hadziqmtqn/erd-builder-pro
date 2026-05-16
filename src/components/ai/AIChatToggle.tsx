import React from 'react';
import { MessageSquare, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';

interface AIChatToggleProps {
  isOpen: boolean;
  onClick: () => void;
}

export const AIChatToggle: React.FC<AIChatToggleProps> = ({ isOpen, onClick }) => {
  if (isOpen) return null; // Hidden when panel is open

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              onClick={onClick}
              className="fixed right-4 bottom-4 z-50 size-12 rounded-full shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all duration-200 hover:scale-105 active:scale-95"
              size="icon"
            >
              <Sparkles className="size-5" />
            </Button>
          }
        />
        <TooltipContent side="left">
          AI Assistant
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
