import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Database, WifiOff } from 'lucide-react';
import { cn } from "@/lib/utils";

interface ConnectionLostOverlayProps {
  isOnline: boolean;
}

export function ConnectionLostOverlay({ isOnline }: ConnectionLostOverlayProps) {
  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md px-4"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="w-full max-w-lg overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#121214] p-12 shadow-2xl shadow-black/50"
          >
            <div className="flex flex-col items-center text-center">
              {/* Icon Container */}
              <div className="relative mb-8">
                <div className="absolute inset-0 animate-ping rounded-3xl bg-destructive/20" />
                <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-destructive/10 border border-destructive/20">
                  <Database className="h-10 w-10 text-destructive" />
                </div>
              </div>

              {/* Title */}
              <h2 className="mb-4 text-3xl font-bold tracking-tight text-white">
                Offline Connection lost
              </h2>

              {/* Description */}
              <div className="mb-10 space-y-4 px-4 text-lg leading-relaxed text-muted-foreground">
                <p>
                  Koneksi internet terputus. jangan khawatir, fitur <strong className="text-white">autosave</strong> lokal kami tetap aktif menyimpan perubahan di perangkat anda.
                </p>
                <p className="text-sm border-t border-white/5 pt-4 opacity-80">
                  Namun, demi keamanan data, anda tidak dapat beralih halaman hingga koneksi kembali normal.
                </p>
              </div>

              {/* Reconnection Status */}
              <div className="flex items-center gap-3 rounded-full bg-white/5 px-6 py-2 border border-white/10">
                <div className="relative flex h-2 w-2">
                  <div className="absolute inset-0 animate-ping rounded-full bg-destructive/40" />
                  <div className="relative h-2 w-2 rounded-full bg-destructive" />
                </div>
                <span className="text-sm font-medium tracking-wide text-destructive/80 animate-pulse uppercase">
                  waiting for reconnection...
                </span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
