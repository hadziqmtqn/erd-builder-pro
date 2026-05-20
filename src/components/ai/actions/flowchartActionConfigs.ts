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

const COLOR_PALETTE = [
  { name: 'Emerald', hex: '#10b981' },
  { name: 'Violet', hex: '#8b5cf6' },
  { name: 'Amber', hex: '#f59e0b' },
  { name: 'Rose', hex: '#f43f5e' },
  { name: 'Sky', hex: '#0ea5e9' },
  { name: 'Teal', hex: '#14b8a6' },
  { name: 'Orange', hex: '#f97316' },
  { name: 'Slate', hex: '#64748b' },
];

function flowchartSymbolDetail(context: Record<string, any>): string {
  const nodes: any[] = context.nodes || [];
  const edges: any[] = context.edges || [];
  if (nodes.length === 0) return '(empty flowchart — no symbols yet)';

  const nodeMap = new Map<string, any>(nodes.map((n: any) => [n.id, n]));

  const outgoing: Record<string, string[]> = {};
  const incoming: Record<string, string[]> = {};
  for (const e of edges) {
    const src: any = nodeMap.get(e.source);
    const tgt: any = nodeMap.get(e.target);
    const sLabel = src?.data?.label || e.source;
    const tLabel = tgt?.data?.label || e.target;
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
      return `  "${d.label || 'unnamed'}" (${meaning}, color: ${d.color || '#8b5cf6'})${connStr}`;
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
3. Node shapes (use ONLY these exact values — do not use descriptions like "Start/End"): "oval", "rectangle", "diamond", "parallelogram", "database", "document", "cloud", "circle".
4. Colors: Use hex codes from this palette — Emerald (#10b981) for start/end, Violet (#8b5cf6) for processes, Amber (#f59e0b) for decisions, Rose (#f43f5e) for errors, Sky (#0ea5e9) for I/O, Teal (#14b8a6) for data, Orange (#f97316) for external systems.
5. For edges, use "sourceLabel" and "targetLabel" matching the node labels exactly. Do NOT use "from"/"to" or numeric ids.
6. For diamond (decision) nodes, ALWAYS label the outgoing edges: "Yes" for the true/positive branch, "No" for the false/negative branch.

Example with decision branching:
\`\`\`json
{
  "nodes": [
    { "label": "Start", "shape": "oval", "color": "#10b981" },
    { "label": "Check Stock", "shape": "diamond", "color": "#f59e0b" },
    { "label": "Process Payment", "shape": "rectangle", "color": "#8b5cf6" },
    { "label": "Show Error", "shape": "rectangle", "color": "#f43f5e" },
    { "label": "End", "shape": "oval", "color": "#10b981" }
  ],
  "edges": [
    { "sourceLabel": "Start", "targetLabel": "Check Stock" },
    { "sourceLabel": "Check Stock", "targetLabel": "Process Payment", "label": "Yes" },
    { "sourceLabel": "Check Stock", "targetLabel": "Show Error", "label": "No" },
    { "sourceLabel": "Process Payment", "targetLabel": "End" },
    { "sourceLabel": "Show Error", "targetLabel": "End" }
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
  {
    id: 'flowchart-insert',
    label: 'Insert Symbol',
    description: 'Add a symbol between two existing symbols',
    icon: 'Between',
    buildPrompt: (ctx) => {
      const symbols = flowchartSymbolDetail(ctx);
      return `You are a flowchart editor. The user wants to insert a new symbol between two existing symbols.

Current symbols:\n${symbols}

Instructions:
1. The user will say something like "Insert 'Validate Payment' after 'Checkout'" or "Add step between A and B".
2. Respond with a JSON code block containing:
   - "sourceLabel": the label of the existing node that comes BEFORE the insertion point
   - "targetLabel": the label of the existing node that comes AFTER the insertion point
   - "newNode": object with "label", "shape", and "color" for the new symbol
   - "insertEdgeLabel1" (optional): label for the edge from source to new node
   - "insertEdgeLabel2" (optional): label for the edge from new node to target

Example:
\`\`\`json
{
  "sourceLabel": "Check Stock",
  "targetLabel": "Process Payment",
  "newNode": {
    "label": "Verify Inventory",
    "shape": "rectangle",
    "color": "#8b5cf6"
  },
  "insertEdgeLabel1": "Available",
  "insertEdgeLabel2": "Proceed"
}
\`\`\`

3. Use ONLY these shape values: "oval", "rectangle", "diamond", "parallelogram", "database", "document", "cloud", "circle".
4. After the JSON block, add a brief message: "Klik tombol **Append** untuk menyisipkan simbol ini."`;
    },
  },
  {
    id: 'flowchart-colorize',
    label: 'Auto Color Scheme',
    description: 'Suggest consistent colors for all symbols',
    icon: 'Palette',
    buildPrompt: (ctx) => {
      const symbols = flowchartSymbolDetail(ctx);
      const paletteStr = COLOR_PALETTE.map(c => `  ${c.name}: ${c.hex}`).join('\n');
      return `You are a flowchart designer. Analyze the flowchart and suggest a consistent color scheme.

Current symbols with their current colors:\n${symbols}

Available color palette:\n${paletteStr}

Instructions:
1. Assign appropriate colors to each symbol based on its role:
   - Start/End (oval) → use Emerald (#10b981) or a consistent color for all
   - Decisions (diamond) → use Amber (#f59e0b) consistently for all decisions
   - Error paths → use Rose (#f43f5e)
   - I/O (parallelogram) → use Sky (#0ea5e9)
   - Processes (rectangle) → use Violet (#8b5cf6) or Teal (#14b8a6)
   - External systems (cloud) → use Orange (#f97316)
   - Data (database) → use Teal (#14b8a6)
2. Use a MAXIMUM of 3-4 distinct colors across the entire diagram — don't use every color in the palette.
3. Same shape types should share the same color.

Respond with a JSON code block:
\`\`\`json
{
  "colors": {
    "Node Label 1": "#10b981",
    "Node Label 2": "#8b5cf6"
  }
}
\`\`\`

After the JSON block, add a brief message: "Klik tombol **Append** untuk menerapkan skema warna ini."`;
    },
  },
  {
    id: 'flowchart-import',
    label: 'Import from Description',
    description: 'Generate entire flowchart from a text description, replacing current',
    icon: 'Import',
    buildPrompt: (ctx) => {
      return `You are a flowchart generator. The user will describe a process or workflow, and you will generate a complete flowchart.

Instructions:
1. Respond with a JSON code block containing "nodes" and "edges".
2. Design the complete flowchart based on the user's description.
3. Node shapes (use ONLY these exact values): "oval", "rectangle", "diamond", "parallelogram", "database", "document", "cloud", "circle".
4. Colors: Use hex codes from this palette — Emerald (#10b981) for start/end, Violet (#8b5cf6) for processes, Amber (#f59e0b) for decisions, Rose (#f43f5e) for errors/paths, Sky (#0ea5e9) for I/O.
5. For edges, use "sourceLabel" and "targetLabel" matching the node labels exactly.
6. For diamond (decision) nodes, ALWAYS label the outgoing edges: "Yes" for the true/positive branch, "No" for the false/negative branch.
7. You MUST always include a Start (oval) and End (oval) node.

Example:
\`\`\`json
{
  "nodes": [
    { "label": "Start", "shape": "oval", "color": "#10b981" },
    { "label": "Check Condition", "shape": "diamond", "color": "#f59e0b" },
    { "label": "Do Action", "shape": "rectangle", "color": "#8b5cf6" },
    { "label": "Skip", "shape": "rectangle", "color": "#f43f5e" },
    { "label": "End", "shape": "oval", "color": "#10b981" }
  ],
  "edges": [
    { "sourceLabel": "Start", "targetLabel": "Check Condition" },
    { "sourceLabel": "Check Condition", "targetLabel": "Do Action", "label": "Yes" },
    { "sourceLabel": "Check Condition", "targetLabel": "Skip", "label": "No" },
    { "sourceLabel": "Do Action", "targetLabel": "End" },
    { "sourceLabel": "Skip", "targetLabel": "End" }
  ]
}
\`\`\`

After the JSON block, add a brief message: "Klik tombol **Append** untuk mengganti diagram saat ini."`;
    },
  },
];
