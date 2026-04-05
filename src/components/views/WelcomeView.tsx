import React from 'react';
import { Database, ArrowLeft } from 'lucide-react';

export function WelcomeView() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-zinc-950/20 rounded-xl border border-dashed border-zinc-800/50 relative overflow-hidden">
      {/* Background Decorative Glow (Static) */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
      
      <div className="relative z-10 flex flex-col items-center text-center max-w-sm">
        <div className="mb-8 relative">
          <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full scale-110" />
          <div className="relative size-20 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-2xl">
            <Database className="size-10 text-primary" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-white mb-3 tracking-tight">
          Welcome to ERD Builder Pro
        </h1>
        
        <p className="text-zinc-400 text-sm leading-relaxed mb-8 px-4">
          Select a project, diagram, or note from the sidebar to start designing your database schema, taking notes, or sketching ideas.
        </p>

        <div className="flex items-center gap-3 text-primary font-bold text-[10px] uppercase tracking-[0.2em] bg-primary/5 px-4 py-2 rounded-full border border-primary/20 shadow-[0_0_20px_rgba(var(--primary-rgb),0.05)]">
          <ArrowLeft className="size-3" />
          Start from Sidebar
        </div>
      </div>
    </div>
  );
}
