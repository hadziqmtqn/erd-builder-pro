import { 
  MoreHorizontal, 
  Share2, 
  Link2, 
  Trash2, 
  Edit2, 
  Settings2,
  Copy,
  Download,
  Upload,
  Database,
  FileText,
  Image as ImageIcon,
  BarChart3
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuLabel,
  DropdownMenuGroup
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useWorkspace } from "@/providers/WorkspaceContext";

interface NavActionsMenuProps {
  onShare: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onExportSQL?: (dialect: 'postgresql' | 'mysql') => void;
  onExportPDF?: () => void;
  onExportImage?: () => void;
  onExportMarkdown?: () => void;
  onCopyMarkdown?: () => void;
  onImportMarkdown?: () => void;
  isOnline: boolean;
  isPublicView?: boolean;
  isPublic?: boolean;
  activeFileUid?: string;
  documentType: 'erd' | 'notes' | 'drawings' | 'flowchart' | string;
  noteContent?: string;
}

function FlowchartExportMenu() {
  const { flowchartExportHandler } = useWorkspace();
  if (!flowchartExportHandler) return null;

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="gap-2 cursor-pointer">
          <Download className="h-4 w-4 text-muted-foreground" />
          <span>Export</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-52 p-1">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-2 py-1.5">SVG Format</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={flowchartExportHandler.exportAll} 
              className="gap-3 px-3 py-2 text-xs font-semibold cursor-pointer"
            >
              <ImageIcon className="h-4 w-4 text-purple-400" />
              <span>All Canvas</span>
            </DropdownMenuItem>
            {flowchartExportHandler.groups.map(group => (
              <DropdownMenuItem 
                key={group}
                onClick={() => flowchartExportHandler.exportGroup(group)} 
                className="gap-3 px-3 py-2 text-xs font-semibold cursor-pointer"
              >
                <ImageIcon className="h-4 w-4 text-purple-400" />
                <span>{group}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </>
  );
}

export const NavActionsMenu = ({
  onShare,
  onRename,
  onDelete,
  onDuplicate,
  onExportSQL,
  onExportPDF,
  onExportImage,
  onExportMarkdown,
  onCopyMarkdown,
  onImportMarkdown,
  isOnline,
  isPublicView = false,
  isPublic = false,
  activeFileUid,
  documentType,
  noteContent
}: NavActionsMenuProps) => {

  const stripHtml = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&[^;]+;/g, ' ').trim();

  const getTextStats = (html?: string) => {
    const text = html ? stripHtml(html) : '';
    if (!text) return { words: 0, sentences: 0, paragraphs: 0, characters: 0 };
    const words = text.split(/\s+/).filter(Boolean).length;
    const sentences = text.split(/[.!?]+(?:\s|$)/).filter(s => s.trim().length > 0).length;
    const paragraphs = html ? (html.match(/<p[^>]*>[\s\S]*?<\/p>/g) || []).length || text.split(/\n\s*\n/).filter(Boolean).length : text.split(/\n\s*\n/).filter(Boolean).length;
    const characters = text.replace(/\s/g, '').length;
    return { words, sentences, paragraphs, characters };
  };

  const stats = getTextStats(noteContent);

  const handleCopyLink = () => {
    if (!activeFileUid) {
      toast.error("Document link not available");
      return;
    }
    
    const urlTypeMap: Record<string, string> = {
      erd: 'diagram',
      notes: 'note',
      drawings: 'drawing',
      flowchart: 'flowchart'
    };
    const urlType = urlTypeMap[documentType] || documentType;
    const url = `${window.location.origin}/view/${urlType}/${activeFileUid}`;
    
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
          {isPublicView ? (
            <DropdownMenuItem 
              onClick={handleCopyLink}
              className="gap-2 cursor-pointer"
            >
              <Link2 className="h-4 w-4 text-muted-foreground" />
              <span>Copy Public Link</span>
            </DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuItem 
                disabled={!isOnline} 
                onClick={onShare}
                className="gap-2 cursor-pointer"
              >
                <Share2 className="h-4 w-4 text-muted-foreground" />
                <span>Share</span>
              </DropdownMenuItem>
              
              {isPublic && (
                <DropdownMenuItem 
                  disabled={!isOnline} 
                  onClick={handleCopyLink}
                  className="gap-2 cursor-pointer"
                >
                  <Link2 className="h-4 w-4 text-muted-foreground" />
                  <span>Copy Public Link</span>
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator />

              <DropdownMenuItem 
                disabled={!isOnline} 
                onClick={onRename}
                className="gap-2 cursor-pointer"
              >
                {documentType === 'erd' ? (
                  <Settings2 className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Edit2 className="h-4 w-4 text-muted-foreground" />
                )}
                <span>{documentType === 'erd' ? 'Settings' : 'Edit Document'}</span>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem 
                disabled={!isOnline} 
                onClick={onDelete}
                className="gap-2 text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
                <span>Move to Trash</span>
              </DropdownMenuItem>
            </>
          )}

          {(documentType === 'notes' || documentType === 'drawings') && !isPublicView && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                disabled={!isOnline} 
                onClick={onDuplicate}
                className="gap-2 cursor-pointer"
              >
                <Copy className="h-4 w-4 text-muted-foreground" />
                <span>Duplicate</span>
              </DropdownMenuItem>
            </>
          )}

          {documentType === 'erd' && !isPublicView && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="gap-2 cursor-pointer">
                  <Download className="h-4 w-4 text-muted-foreground" />
                  <span>Export</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-52 p-1">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-2 py-1.5">SQL Format</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={() => onExportSQL?.('postgresql')} 
                      className="gap-3 px-3 py-2 text-xs font-semibold cursor-pointer"
                    >
                      <Database className="h-4 w-4 text-blue-400" />
                      <span>To PostgreSQL</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => onExportSQL?.('mysql')} 
                      className="gap-3 px-3 py-2 text-xs font-semibold cursor-pointer"
                    >
                      <Database className="h-4 w-4 text-orange-400" />
                      <span>To MySQL</span>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-2 py-1.5">Visual Format</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={onExportPDF} 
                      className="gap-3 px-3 py-2 text-xs font-semibold cursor-pointer"
                    >
                      <FileText className="h-4 w-4 text-red-400" />
                      <span>As PDF</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={onExportImage} 
                      className="gap-3 px-3 py-2 text-xs font-semibold cursor-pointer"
                    >
                      <ImageIcon className="h-4 w-4 text-purple-400" />
                      <span>As Image (SVG)</span>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </>
          )}

          {/* Flowchart SVG export — disabled temporarily */}
          {/* {documentType === 'flowchart' && !isPublicView && <FlowchartExportMenu />} */}

          {documentType === 'notes' && !isPublicView && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                disabled={!isOnline} 
                onClick={onCopyMarkdown}
                className="gap-2 cursor-pointer flex items-center"
              >
                <div className="flex items-center gap-2 flex-1">
                  <Copy className="h-4 w-4 text-muted-foreground" />
                  <span>Copy Markdown</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem 
                disabled={!isOnline} 
                onClick={onImportMarkdown}
                className="gap-2 cursor-pointer flex items-center"
              >
                <div className="flex items-center gap-2 flex-1">
                  <Upload className="h-4 w-4 text-muted-foreground" />
                  <span>Import</span>
                </div>
                <div className="ml-auto flex items-center gap-0.5 text-muted-foreground/60">
                  <span className="text-[13px] font-sans leading-none">⌘</span>
                  <span className="text-[13px] font-sans leading-none">⇧</span>
                  <span className="text-[15px] font-mono font-bold mt-0.5">I</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem 
                disabled={!isOnline} 
                onClick={onExportMarkdown}
                className="gap-2 cursor-pointer flex items-center"
              >
                <div className="flex items-center gap-2 flex-1">
                  <Download className="h-4 w-4 text-muted-foreground" />
                  <span>Export</span>
                </div>
                <div className="ml-auto flex items-center gap-0.5 text-muted-foreground/60">
                  <span className="text-[13px] font-sans leading-none">⌘</span>
                  <span className="text-[13px] font-sans leading-none">⇧</span>
                  <span className="text-[15px] font-mono font-bold mt-0.5">E</span>
                </div>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="gap-2 cursor-pointer">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  <span>Text Stats</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-52 p-1">
                  <div className="px-3 py-1.5 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Words</span>
                      <span className="font-medium tabular-nums">{stats.words.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Sentences</span>
                      <span className="font-medium tabular-nums">{stats.sentences.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Paragraphs</span>
                      <span className="font-medium tabular-nums">{stats.paragraphs.toLocaleString()}</span>
                    </div>
                    <DropdownMenuSeparator className="my-1.5" />
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Characters</span>
                      <span className="font-medium tabular-nums">{stats.characters.toLocaleString()}</span>
                    </div>
                  </div>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
