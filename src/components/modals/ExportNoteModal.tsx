import { useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogBody,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  FileText, 
  FileCode, 
  FileEdit, 
  ChevronDown, 
  Check,
  Download,
  FileBox
} from 'lucide-react';
import { cn } from '@/lib/utils';

type ExportFormat = 'pdf' | 'markdown' | 'word' | 'print';

interface ExportNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (format: ExportFormat, options: any, pageSize: any) => void;
}

export const ExportNoteModal = ({ isOpen, onClose, onExport }: ExportNoteModalProps) => {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('markdown');
  const [options, setOptions] = useState({
    includeTitle: true,
    includeMetadata: true,
    preserveFormatting: true,
    includeEmbedded: false,
    hideEmpty: true,
    showTypeLabels: false
  });
  const handleExport = () => {
    if (['markdown', 'pdf', 'print', 'word'].includes(selectedFormat)) {
      onExport(selectedFormat, options, 'a4');
      onClose();
    }
  };

  const formats = [
    { id: 'markdown', label: 'MD', sub: 'Markdown', icon: FileEdit },
    { id: 'pdf', label: 'PDF', sub: 'Compact', icon: FileBox },
    { id: 'print', label: 'Print', sub: 'High Quality', icon: FileText },
    { id: 'word', label: 'Word', sub: 'Microsoft', icon: FileCode },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent size="lg">
        <DialogHeader className="flex-row items-center justify-between">
          <DialogTitle className="text-xl pr-0">
            Export
            <span className="ml-2 inline-flex items-center rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold leading-none tracking-wider text-muted-foreground uppercase">
              experimental
            </span>
          </DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-6">
          {/* Format Selection Cards - 4 in 1 row on medium screens */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {formats.map((format) => (
              <button
                key={format.id}
                onClick={() => setSelectedFormat(format.id as ExportFormat)}
                className={cn(
                  "group relative flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg border p-3 transition-colors",
                  selectedFormat === format.id 
                    ? "border-primary bg-accent text-accent-foreground" 
                    : "border-border bg-background hover:bg-muted"
                )}
              >
                <div className={cn(
                  "flex size-10 items-center justify-center rounded-md bg-muted transition-colors",
                  selectedFormat === format.id && "bg-background"
                )}>
                  <format.icon className="size-5 text-primary" />
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-center text-xs font-semibold leading-tight">
                    {format.label}
                  </span>
                  <span className="text-[10px] font-medium text-muted-foreground">{format.sub}</span>
                </div>
                
                {selectedFormat === format.id && (
                  <div className="absolute top-2 right-2">
                    <Check className="size-3 text-primary" />
                  </div>
                )}
              </button>
            ))}
          </div>

          {selectedFormat === 'markdown' && (
            <div className="flex items-center gap-4 rounded-lg border border-border bg-muted/50 p-4 text-muted-foreground">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-background">
                <FileEdit className="size-5 text-primary" />
              </div>
              <p className="text-sm leading-relaxed">
                <span className="mb-0.5 block font-semibold text-foreground">Plain-text Markdown</span>
                Export your notes in a clean, portable format. Paging and advanced layouts are not applicable to Markdown files.
              </p>
            </div>
          )}

          {/* Options Section */}
          {selectedFormat !== 'markdown' && (
            <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <FileBox className="size-4" />
                <span className="text-xs font-bold uppercase tracking-widest">Options</span>
              </div>
              <ChevronDown className="size-4 text-muted-foreground" />
            </div>

            <div className="space-y-5 rounded-lg border border-border bg-muted/30 p-4">
              {[
                { id: 'includeTitle', label: 'Include Document Title', sub: 'Adds the title at the top of the exported file.' },
                { id: 'includeMetadata', label: 'Include Metadata', sub: 'Includes project name and last updated timestamp.' },
                { id: 'preserveFormatting', label: 'Preserve Formatting', sub: 'Maintains colors, styles, and font weights precisely.' },
              ].map((opt) => (
                <label key={opt.id} className="group flex cursor-pointer items-start gap-3">
                  <Checkbox
                    checked={(options as Record<string, any>)[opt.id]}
                    onCheckedChange={checked => setOptions(prev => ({ ...prev, [opt.id]: checked }))}
                    className="mt-0.5"
                  />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-foreground">{opt.label}</span>
                    <span className="text-xs leading-relaxed text-muted-foreground">{opt.sub}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}
      </DialogBody>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button onClick={handleExport}>
            <Download />
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
