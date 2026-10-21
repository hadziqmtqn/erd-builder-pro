import type { ElementType } from 'react';
import { ChevronDown } from 'lucide-react';
import { useFilePanes } from '@/contexts/FilePanesContext';
import { paneKey, type PaneFile } from '@/lib/file-panes';
import { Button } from './ui/button';
import { ButtonGroup } from './ui/button-group';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem } from './ui/dropdown-menu';

export function ProjectFileTabButton({ file, title, feature, icon: Icon, active, onSelect }: {
  file: PaneFile | null; title: string; feature: string; icon: ElementType; active: boolean; onSelect: () => void;
}) {
  const panes = useFilePanes();
  const isOpen = file && panes?.files.some(open => paneKey(open) === paneKey(file));
  const isActive = panes?.files.length ? !!isOpen : active;
  return <ButtonGroup aria-label={title}>
    <Button variant={isActive ? 'default' : 'outline'} size="sm" aria-current={isActive ? 'page' : undefined} data-state={isActive ? 'active' : 'inactive'} onClick={onSelect}
      className="max-w-44 border-input"
      title={`${feature}: ${title}`}>
      <Icon data-icon="inline-start" /><span className="truncate">{title}</span>
    </Button>
    {panes?.desktop && panes.canSplit && file && <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant={isActive ? 'default' : 'outline'} size="icon-sm" className="rounded-r-lg! border border-input data-open:rounded-r-lg!" aria-label={`File options: ${title}`}><ChevronDown /></Button>} />
      <DropdownMenuContent align="start" className="w-60"><DropdownMenuGroup>
        <DropdownMenuItem className="whitespace-nowrap" disabled={panes.files.length < 2 && isActive} onClick={() => isOpen && panes.files.length === 2 ? panes.close(file) : panes.open(file)}>
          {isOpen && panes.files.length === 2 ? 'Close pane' : 'Open side by side'}
        </DropdownMenuItem>
      </DropdownMenuGroup></DropdownMenuContent>
    </DropdownMenu>}
  </ButtonGroup>;
}
