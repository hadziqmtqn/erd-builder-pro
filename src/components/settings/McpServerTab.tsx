import React from 'react';
import { Check, Copy, Loader2, TerminalSquare } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import { buildMcpClientConfigs, type McpRuntime } from '@/lib/mcp-client-config';

export function McpServerTab() {
  const [runtime, setRuntime] = React.useState<McpRuntime | null>(null);
  const [error, setError] = React.useState('');
  const [copied, setCopied] = React.useState('');
  const [activeClient, setActiveClient] = React.useState('jetbrains');

  React.useEffect(() => {
    let cancelled = false;
    void apiFetch('/api/mcp/client-config')
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to load MCP configuration.');
        if (!cancelled) setRuntime(data);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Failed to load MCP configuration.');
      });
    return () => { cancelled = true; };
  }, []);

  const copy = async (id: string, content: string) => {
    await navigator.clipboard.writeText(content);
    setCopied(id);
    toast.success('MCP configuration copied');
    window.setTimeout(() => setCopied(''), 1500);
  };

  if (error) {
    return (
      <div className="p-6">
        <h2 className="text-lg font-semibold">MCP Integration</h2>
        <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!runtime) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  }

  const configs = buildMcpClientConfigs(runtime);
  const activeConfig = configs.find((config) => config.id === activeClient) || configs[0];

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <TerminalSquare className="size-5" />
          Connect AI Clients
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Use ERD Builder Pro as a local MCP Server (STDIO) with an external AI client. The launcher runs headlessly without opening another app window.
        </p>
      </div>

      <div className="rounded-lg border bg-muted/30 px-4 py-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">MCP Server (STDIO) launcher</p>
        <code className="mt-1 block break-all text-xs">{runtime.command}</code>
      </div>

      <div role="tablist" aria-label="MCP client" className="flex w-full flex-wrap gap-1 rounded-lg border bg-muted p-1">
        {configs.map((config) => {
          const isActive = config.id === activeConfig.id;
          return (
            <Button
              key={config.id}
              type="button"
              size="sm"
              variant={isActive ? 'default' : 'ghost'}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveClient(config.id)}
              className="flex-1 text-xs"
            >
              {config.label}
            </Button>
          );
        })}
      </div>

      <div role="tabpanel" aria-label={activeConfig.label} className="space-y-3 pt-2">
        <p className="text-sm text-muted-foreground">{activeConfig.description}</p>
        <div className="overflow-hidden rounded-lg border bg-muted/40">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{activeConfig.language}</span>
            <Button variant="ghost" size="xs" onClick={() => void copy(activeConfig.id, activeConfig.content)}>
              {copied === activeConfig.id ? <Check /> : <Copy />}
              {copied === activeConfig.id ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <pre className="max-h-72 overflow-auto whitespace-pre p-4 text-xs leading-relaxed"><code>{activeConfig.content}</code></pre>
        </div>
      </div>
    </div>
  );
}
