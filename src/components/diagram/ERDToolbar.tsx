import type { ReactElement } from 'react';
import type { Node } from '@xyflow/react';
import { Plus, Upload, Undo2, Redo2, LayoutGrid, RefreshCw, Database, Download, FolderGit2 } from 'lucide-react';
import type { Entity } from '@/types';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { JumpToNode } from '@/components/JumpToNode';
import { useIsMobile } from '@/hooks/use-mobile';
import { isInstalledApp } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ERDToolbarProps {
  nodes: Node<Entity>[];
  isReadOnly: boolean;
  isProductionDb: boolean;
  addEntity: () => void;
  onImportSQL?: () => void;
  onAutoLayout?: () => void;
  onRefresh?: () => void;
  isRefreshingDocument?: boolean;
  setRightPanelMode: (mode: 'dbml' | 'repository') => void;
  handleSync: () => void;
  isSyncing: boolean;
  handleExportImage: () => void;
  undo?: () => void;
  redo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

export function ERDToolbar({ nodes, isReadOnly, isProductionDb, addEntity, onImportSQL, onAutoLayout,
  onRefresh, isRefreshingDocument, setRightPanelMode, handleSync, isSyncing, handleExportImage,
  undo, redo, canUndo, canRedo }: ERDToolbarProps) {
  const isMobile = useIsMobile();
  const action = (label: string, button: ReactElement<{ disabled?: boolean }>) => isMobile ? button : <Tooltip>
    <TooltipTrigger render={button.props.disabled ? <span className="inline-flex">{button}</span> : button} />
    <TooltipContent side="right">{label}</TooltipContent>
  </Tooltip>;
  const mobileButton = 'h-9 px-3 border-border hover:bg-muted bg-muted/50 text-xs font-semibold cursor-pointer';
  const iconClass = cn('size-3.5', isMobile && 'sm:mr-1.5');
  const label = (name: string) => isMobile && <span className="hidden sm:inline">{name}</span>;

  return <div className={cn('absolute z-10 pointer-events-none flex',
    isMobile ? 'top-6 inset-x-0 justify-center px-3' : 'top-4 left-4 bottom-28 items-start')}>
    <div role="group" aria-label="ERD tools" className={cn('flex gap-1.5 p-1.5 bg-background/95 backdrop-blur-md border border-border/50 rounded-2xl shadow-2xl pointer-events-auto no-scrollbar',
      isMobile ? 'items-center max-w-full overflow-x-auto' : 'flex-col items-center max-h-full overflow-y-auto')}>
      <JumpToNode nodes={nodes} label="Table" iconOnly={!isMobile} findShortcut={!isProductionDb} />
      {onRefresh && action('Refresh to the latest version', <Button onClick={onRefresh} disabled={isRefreshingDocument} variant="outline"
        size="icon-lg" className={isMobile ? 'border-border hover:bg-muted bg-muted/50 cursor-pointer' : undefined} aria-label="Refresh to the latest version" title={isMobile ? 'Refresh to the latest version' : undefined}>
        <RefreshCw className={cn('size-3.5', isRefreshingDocument && 'animate-spin')} />
      </Button>)}
      {!isReadOnly && <div className={cn('bg-border shrink-0', isMobile ? 'w-px h-6 mx-0.5' : 'h-px w-6 my-0.5')} />}
      {!isReadOnly && action('Add Table', <Button onClick={addEntity} size={isMobile ? 'sm' : 'icon-lg'} aria-label="Add Table"
        className={isMobile ? 'h-9 px-3 sm:px-4 font-bold shadow-lg shadow-primary/20 cursor-pointer' : undefined}>
        <Plus className={cn('size-4', isMobile && 'sm:mr-2')} />{label('Add Table')}
      </Button>)}
      {!isReadOnly && action('Import SQL', <Button onClick={onImportSQL} variant="outline" size={isMobile ? 'sm' : 'icon-lg'} aria-label="Import SQL" className={isMobile ? mobileButton : undefined}>
        <Upload className={iconClass} />{label('Import SQL')}
      </Button>)}
      {!isProductionDb && !isReadOnly && action('DBML', <Button onClick={() => setRightPanelMode('dbml')} variant="outline" size={isMobile ? 'sm' : 'icon-lg'} aria-label="DBML" className={isMobile ? mobileButton : undefined}>
        <Database className={iconClass} />{label('DBML')}
      </Button>)}
      {!isReadOnly && !isProductionDb && isInstalledApp() && action('Repository', <Button onClick={() => setRightPanelMode('repository')} variant="outline" size={isMobile ? 'sm' : 'icon-lg'} aria-label="Repository" className={isMobile ? mobileButton : undefined}>
        <FolderGit2 className={iconClass} />{label('Repository')}
      </Button>)}
      {onAutoLayout && (!isReadOnly || isProductionDb) && action('Auto Layout', <Button onClick={onAutoLayout} variant="outline" size={isMobile ? 'sm' : 'icon-lg'} aria-label="Auto Layout" className={isMobile ? mobileButton : undefined}>
        <LayoutGrid className={iconClass} />{label('Auto Layout')}
      </Button>)}
      {isProductionDb && action(isSyncing ? 'Syncing...' : 'Sync', <Button onClick={handleSync} variant="outline" size={isMobile ? 'sm' : 'icon-lg'} aria-label={isSyncing ? 'Syncing...' : 'Sync'} disabled={isSyncing}
        className={isMobile ? 'h-9 px-3 border-amber-500/50 hover:bg-amber-500/10 bg-amber-500/5 text-amber-600 dark:text-amber-400 text-xs font-semibold cursor-pointer' : undefined}>
        <RefreshCw className={cn(iconClass, isSyncing && 'animate-spin')} />{label(isSyncing ? 'Syncing...' : 'Sync')}
      </Button>)}
      {isProductionDb && action('Export SVG', <Button onClick={handleExportImage} variant="outline" size={isMobile ? 'sm' : 'icon-lg'} aria-label="Export SVG" title={isMobile ? 'Export SVG' : undefined} className={isMobile ? mobileButton : undefined}>
        <Download className={iconClass} />{label('Export SVG')}
      </Button>)}
      {!isReadOnly && <div className={cn('flex gap-0.5', isMobile ? 'items-center ml-auto' : 'flex-col items-center')}>
        {action('Undo (Ctrl+Z)', <Button variant="ghost" size="icon" onClick={undo} disabled={!canUndo} aria-label="Undo (Ctrl+Z)" title={isMobile ? 'Undo (Ctrl+Z)' : undefined} className={isMobile ? 'h-8 w-8 text-muted-foreground hover:text-foreground disabled:opacity-30' : undefined}>
          <Undo2 className="size-4" />
        </Button>)}
        {action('Redo (Ctrl+Y)', <Button variant="ghost" size="icon" onClick={redo} disabled={!canRedo} aria-label="Redo (Ctrl+Y)" title={isMobile ? 'Redo (Ctrl+Y)' : undefined} className={isMobile ? 'h-8 w-8 text-muted-foreground hover:text-foreground disabled:opacity-30' : undefined}>
          <Redo2 className="size-4" />
        </Button>)}
      </div>}
    </div>
  </div>;
}
