import { AIAction } from './types';

const SHAPE_MEANINGS: Record<string, string> = {
  oval: 'Start/End',
  rectangle: 'Process/Action',
  diamond: 'Decision/Branch',
  parallelogram: 'Input/Output',
  database: 'Database/Storage',
  document: 'Document/Report',
  cloud: 'External System/Service',
  circle: 'Connector/Junction',
};

function flowchartSymbolDetail(context: Record<string, any>): string {
  const nodes = context.nodes || [];
  const edges = context.edges || [];
  if (nodes.length === 0) return '(empty flowchart — no symbols yet)';

  const outgoing: Record<string, string[]> = {};
  const incoming: Record<string, string[]> = {};
  for (const e of edges) {
    const sLabel = nodes.find((n: any) => n.id === e.source)?.data?.label || e.source;
    const tLabel = nodes.find((n: any) => n.id === e.target)?.data?.label || e.target;
    if (!outgoing[e.source]) outgoing[e.source] = [];
    outgoing[e.source].push(`${tLabel}${e.label ? ` [${e.label}]` : ''}`);
    if (!incoming[e.target]) incoming[e.target] = [];
    incoming[e.target].push(`${sLabel}${e.label ? ` [${e.label}]` : ''}`);
  }

  return nodes
    .map((n: any) => {
      const d = n.data || {};
      const shape = d.shape || 'rectangle';
      const meaning = SHAPE_MEANINGS[shape] || shape;
      const outStr = (outgoing[n.id] || []).join(', ');
      const inStr = (incoming[n.id] || []).join(', ');
      const connParts: string[] = [];
      if (outStr) connParts.push(`→ ${outStr}`);
      if (inStr) connParts.push(`← ${inStr}`);
      const connStr = connParts.length > 0 ? ` [${connParts.join('; ')}]` : ' [isolated]';
      return `  "${d.label || 'unnamed'}" (${meaning})${connStr}`;
    })
    .join('\n');
}

export const flowchartActions: AIAction[] = [
  {
    id: 'flowchart-generate',
    label: 'Generate Flowchart',
    description: 'Create flowchart from text description',
    icon: 'Plus',
    buildPrompt: (ctx) => {
      const symbols = flowchartSymbolDetail(ctx);

      return `You are a flowchart generator. The user's current flowchart context is provided separately — focus on the user's new request.

Current symbols:\n${symbols}

User Request: Generate a flowchart for [USER TOPIC].

Instruction:
1. Respond with a JSON code block containing "nodes" and "edges".
2. Multi-case support: You can create multiple independent process flows (each with its own Start and End) within the same file if the user describes multiple scenarios.
3. Node shapes: oval (Start/End), rectangle (Process), diamond (Decision), parallelogram (Input/Output), database (storage), document (report), cloud (external system), circle (connector).
4. Colors: Use hex codes (e.g., #8b5cf6 for purple, #10b981 for green, #ef4444 for red).
5. For edges, use "sourceLabel" and "targetLabel" matching the node labels exactly.

Example:
\`\`\`json
{
  "nodes": [
    { "label": "Start", "shape": "oval", "color": "#10b981" },
    { "label": "Process", "shape": "rectangle", "color": "#8b5cf6" },
    { "label": "End", "shape": "oval", "color": "#ef4444" }
  ],
  "edges": [
    { "sourceLabel": "Start", "targetLabel": "Process" },
    { "sourceLabel": "Process", "targetLabel": "End" }
  ]
}
\`\`\`

After the JSON block, add a brief message: "Klik tombol **Append** untuk menambahkan flowchart ini ke kanvas."`;
    },
  },
  {
    id: 'flowchart-explain',
    label: 'Explain Flow',
    description: 'Natural language description of the flow',
    icon: 'Explain',
    buildPrompt: (ctx) => {
      const symbols = flowchartSymbolDetail(ctx);
      return `Describe what this flowchart represents in plain language. Explain the process flow step by step, including what each symbol does and how the flow branches:\n\n${symbols}`;
    },
  },
  {
    id: 'flowchart-pseudocode',
    label: 'Generate Pseudocode',
    description: 'Pseudocode from the flowchart',
    icon: 'Code',
    buildPrompt: (ctx) => {
      const symbols = flowchartSymbolDetail(ctx);
      return `Generate pseudocode that represents the logic and flow shown in this flowchart. Map each symbol to code:\n- Oval → start/end block\n- Rectangle → action/process statement\n- Diamond → if/else or switch condition\n- Parallelogram → input/output statement\n- Database → data store operation\n\nFlowchart:\n${symbols}`;
    },
  },
];
