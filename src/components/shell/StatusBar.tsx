"use client";

import { Fuel, ShieldCheck, Wifi } from "lucide-react";
import { useNetworkConfig } from "@/contexts/WalletContext";

// Quiet reassurance at the bottom of every screen — only user-facing state,
// no internal node IDs, block counters, method names or implementation detail.
export function StatusBar() {
  const cfg = useNetworkConfig();

  return (
    <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[var(--bg)]/90 backdrop-blur-md">
      <div className="mx-auto flex h-9 w-full max-w-[1200px] items-center gap-4 px-4 text-xs text-[var(--faint)] sm:px-6">
        <span className="flex items-center gap-1.5 text-[var(--muted)]">
          <ShieldCheck className="h-3.5 w-3.5 text-[var(--accent)]" />
          Rewards protected
        </span>
        <span className="hidden items-center gap-1.5 sm:flex">
          <Wifi className="h-3.5 w-3.5 text-[var(--info)]" />
          Connected to {cfg.label}
        </span>
        <span className="flex-1" />
        {cfg.gasless && (
          <span className="flex items-center gap-1.5 text-[var(--accent)]">
            <Fuel className="h-3.5 w-3.5" /> No network fee
          </span>
        )}
      </div>
    </footer>
  );
}
