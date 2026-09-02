import { ListTree, Play, Sparkles, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';

type QueryMode = 'run' | 'explain';

type Props = {
  beautifying: boolean;
  runningMode: QueryMode | null;
  onBeautify: () => void;
  onExplain: () => void;
  onRun: () => void;
  onStop: () => void;
};

export function DataQueryEditorActions({ beautifying, runningMode, onBeautify, onExplain, onRun, onStop }: Props) {
  return (
    <div className="flex shrink-0 justify-end gap-2 border-t px-2 py-1">
      <Button size="sm" variant="outline" onClick={onBeautify} disabled={beautifying || runningMode !== null}>
        <Sparkles className="mr-1.5 h-3.5 w-3.5" /> {beautifying ? 'Beautifying' : 'Beautify'}
      </Button>
      <Button size="sm" variant="outline" onClick={onExplain} disabled={runningMode !== null} title="Explain selection or current statement without executing it">
        <ListTree className="mr-1.5 h-3.5 w-3.5" /> Explain
      </Button>
      <Button size="sm" variant={runningMode ? 'destructive' : 'default'} title="Run selection or current statement (Cmd/Ctrl+Enter)" onClick={runningMode ? onStop : onRun}>
        {runningMode ? <Square className="mr-1.5 h-3.5 w-3.5" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
        {runningMode ? 'Stop' : 'Run'}
      </Button>
    </div>
  );
}
