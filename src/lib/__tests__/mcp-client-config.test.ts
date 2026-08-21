import { describe, expect, it } from 'vitest';
import { buildMcpClientConfigs } from '../mcp-client-config';

describe('buildMcpClientConfigs', () => {
  it('uses the supplied runtime command in every client format', () => {
    const configs = buildMcpClientConfigs({
      command: '/Applications/ERD Builder Pro.app/Contents/Resources/bin/erdbpro-mcp',
      args: [],
      platform: 'darwin',
    });

    expect(configs).toHaveLength(5);
    expect(configs.every((config) => config.content.includes('/Applications/ERD Builder Pro.app/Contents/Resources/bin/erdbpro-mcp'))).toBe(true);
    expect(configs.find((config) => config.id === 'codex')?.content).toContain("'/Applications/ERD Builder Pro.app/Contents/Resources/bin/erdbpro-mcp'");
    expect(configs.find((config) => config.id === 'jetbrains')?.content).not.toContain('"args"');
  });

  it('includes CLI arguments when the runtime needs them', () => {
    const configs = buildMcpClientConfigs({
      command: 'C:\\Program Files\\nodejs\\node.exe',
      args: ['C:\\Users\\me\\erdbpro.js', 'mcp'],
      platform: 'win32',
    });

    expect(configs.find((config) => config.id === 'vscode')?.content).toContain('erdbpro.js');
    expect(configs.find((config) => config.id === 'codex')?.content).toContain('"C:\\Program Files\\nodejs\\node.exe"');
  });
});
