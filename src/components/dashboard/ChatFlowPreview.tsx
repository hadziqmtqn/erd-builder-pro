import { Bot, User, Replace, ArrowDownToLine, Database, FileText, Copy, Info } from 'lucide-react';

/** Static preview of AI chat flow showing Button Actions on an SQL response */
export function ChatFlowPreview() {
  return (
    <div className="w-full max-w-4xl mx-auto px-6 pb-6">
      {/* Section header */}
      <div className="flex items-center gap-2.5 mb-4">
        <div className="h-px flex-1 bg-border/60" />
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
          <Info className="size-3" />
          AI Chat & Button Actions Preview
        </div>
        <div className="h-px flex-1 bg-border/60" />
      </div>

      {/* Chat conversation — scrollable */}
      <div className="rounded-xl border border-border/40 bg-card/30 overflow-hidden">
        {/* Chat header */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/30 bg-muted/10 shrink-0">
          <Bot className="size-3.5 text-primary" />
          <span className="text-xs font-semibold">AI Assistant</span>
          <span className="ml-auto text-[10px] text-muted-foreground/40 font-medium uppercase tracking-wider">Preview • static</span>
        </div>

        {/* Scrollable messages */}
        <div className="p-4 space-y-5 overflow-y-auto custom-scrollbar" style={{ maxHeight: 340 }}>
          {/* ── User message 1 ── */}
          <div className="flex gap-3 flex-row-reverse">
            <div className="shrink-0 size-7 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <User className="size-3.5" />
            </div>
            <div className="flex flex-col items-end max-w-[85%] min-w-0">
              <div className="rounded-xl px-3.5 py-2.5 text-xs leading-relaxed bg-primary text-primary-foreground">
                Generate an ERD schema for an e-commerce system with users, products, orders, order_items, and payments
              </div>
              <span className="text-[10px] text-muted-foreground/40 px-1 mt-0.5">2 min ago</span>
            </div>
          </div>

          {/* ── AI response 1 ── */}
          <div className="flex gap-3 flex-row group/msg">
            <div className="shrink-0 size-7 rounded-full bg-muted text-muted-foreground flex items-center justify-center">
              <Bot className="size-3.5" />
            </div>
            <div className="flex flex-col items-start max-w-[85%] min-w-0">
              <div className="rounded-xl px-3.5 py-2.5 text-xs leading-relaxed bg-muted/50 border border-border/40 w-full">
                <p className="mb-2 text-muted-foreground">Here's the ERD schema for an e-commerce system:</p>
                {/* SQL code block */}
                <div className="bg-black/5 dark:bg-white/5 rounded-lg border border-border/30 overflow-hidden mb-2">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border/20 bg-muted/30">
                    <span className="size-2 rounded-full bg-red-400/60" />
                    <span className="size-2 rounded-full bg-amber-400/60" />
                    <span className="size-2 rounded-full bg-emerald-400/60" />
                    <span className="ml-2 text-[10px] text-muted-foreground/60 font-medium">SQL</span>
                  </div>
                  <pre className="p-3 text-[11px] font-mono leading-relaxed text-foreground/80 overflow-x-auto">{`CREATE TABLE users (\n  id SERIAL PRIMARY KEY,\n  email VARCHAR(255) UNIQUE NOT NULL,\n  name VARCHAR(100) NOT NULL,\n  created_at TIMESTAMP DEFAULT NOW()\n);\n\nCREATE TABLE products (\n  id SERIAL PRIMARY KEY,\n  name VARCHAR(200) NOT NULL,\n  price DECIMAL(10,2) NOT NULL,\n  stock INT NOT NULL DEFAULT 0\n);\n\nCREATE TABLE orders (\n  id SERIAL PRIMARY KEY,\n  user_id INT REFERENCES users(id),\n  total DECIMAL(10,2) NOT NULL,\n  status VARCHAR(20) DEFAULT 'pending'\n);\n\nCREATE TABLE order_items (\n  id SERIAL PRIMARY KEY,\n  order_id INT REFERENCES orders(id),\n  product_id INT REFERENCES products(id),\n  quantity INT NOT NULL,\n  unit_price DECIMAL(10,2) NOT NULL\n);`}</pre>
                </div>
                <p className="text-muted-foreground text-[11px]">You can apply this schema directly to your ERD canvas, or save it for reference.</p>
              </div>

              <span className="text-[10px] text-muted-foreground/40 px-1 mt-0.5">1 min ago</span>

              {/* ── AI Action Buttons ── */}
              <div className="flex items-center gap-1.5 h-8 mt-1">
                <button className="flex items-center justify-center size-8 bg-destructive/10 text-destructive border border-destructive/20 rounded-md shadow-sm transition-all cursor-default" title="Replace All">
                  <Replace className="size-4" />
                </button>
                <button className="flex items-center justify-center size-8 bg-primary/10 text-primary border border-primary/20 rounded-md shadow-sm transition-all cursor-default" title="Append">
                  <ArrowDownToLine className="size-4" />
                </button>
                <div className="w-px h-6 bg-border mx-1" />
                <button className="flex items-center justify-center size-8 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-md shadow-sm transition-all cursor-default" title="Save as Note">
                  <FileText className="size-4" />
                </button>
                <button className="flex items-center justify-center size-8 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-md shadow-sm transition-all cursor-default" title="Create or update ERD from this SQL">
                  <Database className="size-4" />
                </button>
                <div className="w-px h-6 bg-border mx-1" />
                <button className="flex items-center justify-center size-8 bg-muted/40 border border-border/40 text-muted-foreground rounded-md shadow-sm transition-all cursor-default" title="Copy message">
                  <Copy className="size-4" />
                </button>
              </div>
            </div>
          </div>

          {/* ── User message 2 ── */}
          <div className="flex gap-3 flex-row-reverse">
            <div className="shrink-0 size-7 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <User className="size-3.5" />
            </div>
            <div className="flex flex-col items-end max-w-[85%] min-w-0">
              <div className="rounded-xl px-3.5 py-2.5 text-xs leading-relaxed bg-primary text-primary-foreground">
                Add a payments table with payment_method, status, and reference to orders
              </div>
              <span className="text-[10px] text-muted-foreground/40 px-1 mt-0.5">30s ago</span>
            </div>
          </div>

          {/* ── AI response 2 ── */}
          <div className="flex gap-3 flex-row group/msg">
            <div className="shrink-0 size-7 rounded-full bg-muted text-muted-foreground flex items-center justify-center">
              <Bot className="size-3.5" />
            </div>
            <div className="flex flex-col items-start max-w-[85%] min-w-0">
              <div className="rounded-xl px-3.5 py-2.5 text-xs leading-relaxed bg-muted/50 border border-border/40 w-full">
                <p className="mb-2 text-muted-foreground">Here's the payments table to add:</p>
                <div className="bg-black/5 dark:bg-white/5 rounded-lg border border-border/30 overflow-hidden">
                  <pre className="p-3 text-[11px] font-mono leading-relaxed text-foreground/80 overflow-x-auto">{`CREATE TABLE payments (\n  id SERIAL PRIMARY KEY,\n  order_id INT REFERENCES orders(id),\n  amount DECIMAL(10,2) NOT NULL,\n  payment_method VARCHAR(30) NOT NULL,\n  status VARCHAR(20) DEFAULT 'pending',\n  paid_at TIMESTAMP\n);`}</pre>
                </div>
              </div>

              <span className="text-[10px] text-muted-foreground/40 px-1 mt-0.5">Just now</span>

              {/* ── AI Action Buttons ── */}
              <div className="flex items-center gap-1.5 h-8 mt-1">
                <button className="flex items-center justify-center size-8 bg-destructive/10 text-destructive border border-destructive/20 rounded-md shadow-sm transition-all cursor-default" title="Replace All">
                  <Replace className="size-4" />
                </button>
                <button className="flex items-center justify-center size-8 bg-primary/10 text-primary border border-primary/20 rounded-md shadow-sm transition-all cursor-default" title="Append">
                  <ArrowDownToLine className="size-4" />
                </button>
                <div className="w-px h-6 bg-border mx-1" />
                <button className="flex items-center justify-center size-8 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-md shadow-sm transition-all cursor-default" title="Save as Note">
                  <FileText className="size-4" />
                </button>
                <button className="flex items-center justify-center size-8 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-md shadow-sm transition-all cursor-default" title="Create or update ERD from this SQL">
                  <Database className="size-4" />
                </button>
                <div className="w-px h-6 bg-border mx-1" />
                <button className="flex items-center justify-center size-8 bg-muted/40 border border-border/40 text-muted-foreground rounded-md shadow-sm transition-all cursor-default" title="Copy message">
                  <Copy className="size-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 mt-3 px-1">
        <span className="text-[10px] text-muted-foreground/40 font-medium uppercase tracking-wider">Button actions:</span>
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70">
          <span className="size-2 rounded-sm bg-destructive/20 border border-destructive/30" /> Replace
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70">
          <span className="size-2 rounded-sm bg-primary/20 border border-primary/30" /> Append
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70">
          <span className="size-2 rounded-sm bg-amber-500/20 border border-amber-500/30" /> Note
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70">
          <span className="size-2 rounded-sm bg-indigo-500/20 border border-indigo-500/30" /> ERD
        </span>
      </div>
    </div>
  );
}
