import { beforeAll, describe, expect, it } from 'vitest';
import { extractDBML, extractFlowchartJSON, extractSchemaContent, hasDBMLContent, hasFlowchartJSON, replyPaneTarget } from '../chatUtils';
import { applyToErdContent } from '../actions/erdActions';
import { previewFlowchartContent } from '../actions/flowchartActions';
import { DEFAULT_FLOWCHART_COLOR } from '@/components/flowchart/flowchartColors';
import { loadDbmlCore } from '@/lib/dbml-core';

// The parser is ~15 MB; loading it in parallel test workers can exceed the 10 s hook default.
beforeAll(() => loadDbmlCore(), 60_000);

const dbml = `Table users {
  id bigint [pk]
  email varchar [not null]
}

Table posts {
  id bigint [pk]
  user_id bigint [not null]
}

Ref: posts.user_id > users.id`;

describe('chat DBML extraction', () => {
  it('extracts DBML from a markdown dbml block', () => {
    const content = `Here is the schema:

\`\`\`dbml
${dbml}
\`\`\`

Click the Database button to apply it.`;

    expect(hasDBMLContent(content)).toBe(true);
    expect(extractSchemaContent(content)).toBe(dbml);
  });

  it('extracts DBML from a generic schema block and trims assistant footer text', () => {
    const content = `\`\`\`schema
${dbml}

Click Append to preview and apply it.
\`\`\``;

    expect(extractDBML(content)).toBe(dbml);
  });

  it('applies chat DBML to ERD nodes and edges before SQL fallback', () => {
    const result = applyToErdContent([], [], 'erd-generate-sql', `\`\`\`dbml
${dbml}
\`\`\``);

    expect(result?.nodes.map(node => node.data.name).sort()).toEqual(['posts', 'users']);
    expect(result?.edges).toHaveLength(1);
  });

  it('throws parse errors for invalid AI DBML so Append can show feedback', () => {
    expect(() => applyToErdContent([], [], 'erd-generate-sql', `\`\`\`dbml
Table addresses {
  id BIGSERIAL [pk]
  postal_code VARCHAR(10]
}
\`\`\``)).toThrow();
  });
});

describe('chat flowchart extraction', () => {
  const flowchartJson = `{
  "nodes": [
    {"id": "start", "label": "User Input Login", "type": "start"},
    {"id": "rate_check", "label": "Rate Limit Check", "type": "decision"},
    {"id": "otp", "label": "Kirim OTP", "type": "process"},
    {"id": "success", "label": "Login Berhasil", "type": "terminal"}
  ],
  "edges": [
    {"from": "start", "to": "rate_check"},
    {"from": "rate_check", "to": "otp", "label": "OK"},
    {"from": "otp", "to": "success"}
  ]
}`;

  it('extracts flowchart JSON from a flowchart-labeled code block', () => {
    const content = `Flowchart proses login:

\`\`\`flowchart
${flowchartJson}
\`\`\``;

    expect(hasFlowchartJSON(content)).toBe(true);
    expect(extractFlowchartJSON(content)).toBe(flowchartJson);
  });

  it('maps semantic node types to precise canvas shapes', () => {
    const result = previewFlowchartContent(`\`\`\`json
${flowchartJson}
\`\`\``);

    const byLabel = new Map(result?.nodes.map(node => [node.data.label, node.data.shape]));
    expect(byLabel.get('User Input Login')).toBe('oval');
    expect(byLabel.get('Rate Limit Check')).toBe('diamond');
    expect(byLabel.get('Kirim OTP')).toBe('rectangle');
    expect(byLabel.get('Login Berhasil')).toBe('oval');
    expect(result?.edges).toHaveLength(3);
    expect(result?.nodes.every(node => node.data.color === DEFAULT_FLOWCHART_COLOR)).toBe(true);
  });
});

describe('replyPaneTarget', () => {
  const panes = new Map([['erd:a', 'erd-scope']]);
  const lookup = (key: string) => panes.get(key);
  it('applies a reply to the file it was written for when that file is open in the other pane', () => {
    expect(replyPaneTarget('erd:a', 'notes:b', lookup)).toBe('erd-scope');
  });
  it('keeps the focused editor for its own replies, unknown origins and closed panes', () => {
    expect(replyPaneTarget('erd:a', 'erd:a', lookup)).toBeUndefined();
    expect(replyPaneTarget(undefined, 'notes:b', lookup)).toBeUndefined();
    expect(replyPaneTarget('erd:closed', 'notes:b', lookup)).toBeUndefined();
  });
});

describe('replyPaneTarget', () => {
  const panes = new Map([['erd:a', 'erd-scope']]);
  const lookup = (key: string) => panes.get(key);
  it('applies a reply to the file it was written for when that file is open in the other pane', () => {
    expect(replyPaneTarget('erd:a', 'notes:b', lookup)).toBe('erd-scope');
  });
  it('keeps the focused editor for its own replies, unknown origins and closed panes', () => {
    expect(replyPaneTarget('erd:a', 'erd:a', lookup)).toBeUndefined();
    expect(replyPaneTarget(undefined, 'notes:b', lookup)).toBeUndefined();
    expect(replyPaneTarget('erd:closed', 'notes:b', lookup)).toBeUndefined();
  });
});
