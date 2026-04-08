import React from 'react';
import { motion } from "framer-motion";
import { Database, Share2 } from 'lucide-react';

interface AppInitializationProps {
  type: 'init' | 'public';
  view?: string;
}

export function AppInitialization({ type, view = 'Document' }: AppInitializationProps) {
  if (type === 'init') {
    return (
      <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center gap-6 overflow-hidden">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative">
          <div className="w-20 h-20 rounded-2xl bg-primary flex items-center justify-center shadow-2xl shadow-primary/40">
            <Database className="w-10 h-10 text-primary-foreground animate-bounce" />
          </div>
          <div className="absolute -inset-4 border-2 border-primary/20 rounded-3xl animate-[spin_3s_linear_infinite]" />
        </motion.div>
        <div className="text-center z-10">
          <h2 className="text-xl font-bold text-white mb-2">Preparing your workspace...</h2>
          <div className="flex items-center justify-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <motion.div key={i} animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }} className="w-1.5 h-1.5 rounded-full bg-primary" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center gap-6 overflow-hidden">
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative">
        <div className="w-20 h-20 rounded-2xl bg-yellow-500/10 flex items-center justify-center shadow-2xl shadow-yellow-500/10">
          <Share2 className="w-10 h-10 text-yellow-500 animate-pulse" />
        </div>
        <div className="absolute -inset-4 border-2 border-yellow-500/20 rounded-3xl animate-[spin_3s_linear_infinite]" />
      </motion.div>
      <div className="text-center z-10">
        <h2 className="text-xl font-bold text-white mb-1">Loading shared {view}...</h2>
        <p className="text-xs text-muted-foreground">Preparing read-only view</p>
      </div>
    </div>
  );
}
