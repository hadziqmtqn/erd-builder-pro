export type McpRuntime = {
  command: string;
  args: string[];
  platform: string;
};

export type McpClientConfig = {
  id: string;
  label: string;
  description: string;
  language: 'json' | 'bash' | 'text';
  content: string;
};

const json = (value: unknown) => JSON.stringify(value, null, 2);

function shellArg(value: string, windows: boolean) {
  if (!/[\s"']/.test(value)) return value;
  return windows
    ? `"${value.replace(/"/g, '\\"')}"`
    : `'${value.replace(/'/g, `'\\''`)}'`;
}

export function buildMcpClientConfigs(runtime: McpRuntime): McpClientConfig[] {
  const server = { command: runtime.command, ...(runtime.args.length ? { args: runtime.args } : {}) };
  const shellArgs = runtime.args.map((arg) => shellArg(arg, runtime.platform === 'win32')).join(' ');
  const codexCommand = ['codex', 'mcp', 'add', 'erdbpro', '--', runtime.command, ...runtime.args]
    .map((part) => shellArg(part, runtime.platform === 'win32'))
    .join(' ');

  return [
    {
      id: 'jetbrains',
      label: 'JetBrains AI',
      description: 'Paste into the MCP server JSON configuration.',
      language: 'json',
      content: json({ mcpServers: { erdbpro: server } }),
    },
    {
      id: 'vscode',
      label: 'VS Code',
      description: 'Save as .vscode/mcp.json or paste into the MCP configuration.',
      language: 'json',
      content: json({ servers: { erdbpro: { type: 'stdio', ...server } } }),
    },
    {
      id: 'codex',
      label: 'Codex',
      description: 'Run once in a terminal to register the local MCP server.',
      language: 'bash',
      content: codexCommand,
    },
    {
      id: 'hermes',
      label: 'Hermes Agent',
      description: 'Enter these values in Add MCP Server. Leave Environment empty.',
      language: 'text',
      content: `Name: erdbpro\nTransport: stdio\nCommand: ${runtime.command}\nArgs: ${shellArgs || '(leave empty)'}\nEnvironment: (leave empty)`,
    },
    {
      id: 'generic',
      label: 'Generic MCP (STDIO)',
      description: 'Use for clients that accept a standard STDIO command definition.',
      language: 'json',
      content: json({ transport: 'stdio', ...server }),
    },
  ];
}
