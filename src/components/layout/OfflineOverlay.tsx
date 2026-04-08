import React from 'react';
import { motion } from "framer-motion";
import { Database } from 'lucide-react';

export function OfflineOverlay() {
  return (
    <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center pointer-events-auto">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full p-8 bg-card border border-destructive/20 rounded-3xl shadow-2xl text-center space-y-6"
      >
        <div className="w-16 h-16 bg-destructive/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Database className="w-8 h-8 text-destructive" />
          </motion.div>
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">Offline Connection lost</h2>
          <p className="text-muted-foreground text-balanced lowercase first-letter:uppercase">
            koneksi internet terputus. jangan khawatir, fitur **autosave** lokal kami tetap aktif menyimpan perubahan di perangkat anda. namun, demi keamanan data, anda tidak dapat beralih halaman hingga koneksi kembali normal.
          </p>
        </div>
        <div className="pt-4 flex flex-col gap-3">
          <div className="flex items-center justify-center gap-2 text-xs font-medium text-destructive animate-pulse">
            <span className="w-2 h-2 rounded-full bg-destructive" />
            waiting for reconnection...
          </div>
        </div>
      </motion.div>
    </div>
  );
}
