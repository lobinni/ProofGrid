"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Dialog({
  open,
  onClose,
  title,
  subtitle,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className={cn(
              "relative w-full rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] shadow-[0_24px_80px_-24px_rgba(0,0,0,0.9)]",
              wide ? "max-w-2xl" : "max-w-md"
            )}
          >
            <div className="flex items-start justify-between border-b border-[var(--line)] px-5 py-4">
              <div>
                <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--fg)]">
                  {title}
                </h3>
                {subtitle && <p className="mt-1 text-xs text-[var(--muted)]">{subtitle}</p>}
              </div>
              <button
                onClick={onClose}
                className="cursor-pointer rounded p-1 text-[var(--muted)] transition-colors hover:bg-white/5 hover:text-[var(--fg)]"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
