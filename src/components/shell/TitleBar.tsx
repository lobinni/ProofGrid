"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Download, Grid2x2, LogOut, Wallet as WalletIcon } from "lucide-react";
import { useWalletContext } from "@/contexts/WalletContext";
import { toast } from "@/components/ui/toast";
import { NETWORKS, type NetworkId } from "@/lib/networks";
import { shortAddress } from "@/lib/utils";

function NetworkBadge() {
  const { network, setNetwork } = useWalletContext();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cfg = NETWORKS[network];

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex cursor-pointer items-center gap-2 rounded-md border border-[var(--line)] bg-black/30 px-2.5 py-1.5 text-[10px] tracking-normal text-[var(--muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--fg)]"
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
        </span>
        {cfg.label}
        <ChevronDown className="h-3 w-3" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-md border border-[var(--line-strong)] bg-[var(--panel2)] shadow-[0_20px_60px_-16px_rgba(0,0,0,0.9)]"
          >
            <p className="border-b border-[var(--line)] px-3 py-2 text-[9px] tracking-normal text-[var(--faint)]">
              Network
            </p>
            {(Object.keys(NETWORKS) as NetworkId[]).map((id) => (
              <button
                key={id}
                onClick={() => {
                  setNetwork(id);
                  setOpen(false);
                }}
                className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-white/5"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${id === network ? "bg-[var(--accent)]" : "bg-[var(--faint)]"}`}
                />
                <span className="flex-1">
                  <span className="block text-xs font-medium text-[var(--fg)]">{NETWORKS[id].label}</span>
                  <span className="block text-[11px] text-[var(--faint)]">
                    {!NETWORKS[id].configured
                      ? "Deployment required"
                      : NETWORKS[id].gasless
                        ? "Free to use"
                        : "Test network"}
                  </span>
                </span>
                {id === network && <Check className="h-3.5 w-3.5 text-[var(--accent)]" />}
              </button>
            ))}
            {cfg.explorer && cfg.configured && (
              <a
                href={`${cfg.explorer}/address/${cfg.factoryAddress}`}
                target="_blank"
                rel="noreferrer"
                className="block border-t border-[var(--line)] px-3 py-2 text-[10px] tracking-normal text-[var(--muted)] transition-colors hover:bg-white/5 hover:text-[var(--fg)]"
              >
                View network activity ↗
              </a>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function WalletButton() {
  const { isConnected, address, connect, disconnect, walletAvailable, walletReady } = useWalletContext();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  if (walletReady && !walletAvailable) {
    return (
      <a
        href="https://metamask.io/download/"
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 rounded-md border border-[var(--amber)]/50 bg-[var(--amber)]/10 px-3 py-1.5 text-[10px] font-bold tracking-normal text-[var(--amber)] transition-colors hover:bg-[var(--amber)]/20"
      >
        <Download className="h-3 w-3" />
        Install MetaMask
      </a>
    );
  }

  if (!isConnected || !address) {
    return (
      <button
        onClick={async () => {
          setBusy(true);
          try {
            await connect();
            toast("success", "Wallet connected");
          } catch (err) {
            toast("error", "Connection failed", err instanceof Error ? err.message : "Unknown error");
          } finally {
            setBusy(false);
          }
        }}
        className="flex cursor-pointer items-center gap-2 rounded-md bg-[var(--accent)] px-3 py-1.5 text-[10px] font-bold tracking-normal text-black shadow-[0_0_20px_-6px_var(--accent)] transition-all hover:bg-[var(--accent-hi)] active:scale-[0.97] disabled:opacity-50"
        disabled={busy}
      >
        <WalletIcon className="h-3 w-3" />
        {busy ? "Connecting…" : "Connect"}
      </button>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex cursor-pointer items-center gap-2 rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2.5 py-1.5 text-[10px] tracking-normal text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/15"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
        {shortAddress(address)}
        <ChevronDown className="h-3 w-3" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-md border border-[var(--line-strong)] bg-[var(--panel2)] shadow-[0_20px_60px_-16px_rgba(0,0,0,0.9)]"
          >
            <p className="border-b border-[var(--line)] px-3 py-2 text-[9px] tracking-normal text-[var(--faint)]">
              MetaMask · connected account
            </p>
            <p className="break-all px-3 py-2.5 text-[11px] leading-relaxed text-[var(--muted)]">
              {address}
            </p>
            <button
              onClick={() => {
                disconnect();
                setOpen(false);
              }}
              className="flex w-full cursor-pointer items-center gap-2 border-t border-[var(--line)] px-3 py-2.5 text-left text-[10px] tracking-normal text-[var(--danger)] transition-colors hover:bg-[var(--danger)]/10"
            >
              <LogOut className="h-3 w-3" /> Disconnect
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function TitleBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--bg)]/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--accent)] text-black shadow-[0_0_24px_-6px_var(--accent)] transition-transform duration-300 group-hover:rotate-90">
            <Grid2x2 className="h-4.5 w-4.5" strokeWidth={2.4} />
          </span>
          <span className="leading-none">
            <span className="block text-[15px] font-bold tracking-tight text-[var(--fg)]">
              Proof<span className="text-[var(--accent)]">Grid</span>
            </span>
            <span className="mt-0.5 block text-[10.5px] text-[var(--faint)]">
              Work, reviewed and rewarded
            </span>
          </span>
        </Link>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <NetworkBadge />
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
