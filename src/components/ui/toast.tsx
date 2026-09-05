"use client";

// Tiny pub/sub toaster - one <Toaster /> in the shell; call toast() anywhere.

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { useEffect, useState } from "react";

export interface ToastItem {
  id: number;
  kind: "success" | "error" | "info";
  title: string;
  detail?: string;
}

type Listener = (items: ToastItem[]) => void;

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l([...items]));
}

export function toast(kind: ToastItem["kind"], title: string, detail?: string) {
  const item: ToastItem = { id: nextId++, kind, title, detail };
  items = [...items, item].slice(-4);
  emit();
  setTimeout(() => {
    items = items.filter((t) => t.id !== item.id);
    emit();
  }, 4600);
}

const icons = {
  success: <CheckCircle2 className="h-4 w-4 text-[var(--accent)]" />,
  error: <AlertTriangle className="h-4 w-4 text-[var(--danger)]" />,
  info: <Info className="h-4 w-4 text-[var(--info)]" />,
};

const bars = {
  success: "bg-[var(--accent)]",
  error: "bg-[var(--danger)]",
  info: "bg-[var(--info)]",
};

export function Toaster() {
  const [current, setCurrent] = useState<ToastItem[]>([]);
  useEffect(() => {
    const listener: Listener = (next) => setCurrent(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-10 right-4 z-[100] flex w-[340px] flex-col gap-2">
      <AnimatePresence>
        {current.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, x: 40, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 24, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="pointer-events-auto relative overflow-hidden rounded-md border border-[var(--line-strong)] bg-[var(--panel2)] px-3.5 py-3 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.85)]"
          >
            <span className={`absolute inset-y-0 left-0 w-[3px] ${bars[t.kind]}`} />
            <div className="flex items-start gap-2.5 pl-1">
              {icons[t.kind]}
              <div className="min-w-0">
                <p className="text-[13px] font-medium leading-snug text-[var(--fg)]">{t.title}</p>
                {t.detail && (
                  <p className="mt-0.5 break-words font-mono text-[11px] leading-relaxed text-[var(--muted)]">
                    {t.detail}
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
