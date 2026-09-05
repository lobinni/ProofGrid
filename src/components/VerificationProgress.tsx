"use client";

// Consensus theatre: while request_verification runs, this shows the round's
// stages - evidence fetch, leader proposal, validator votes, agreement - and
// then the per-validator breakdown once the receipt lands.

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BrainCircuit, Check, Globe2, Loader2, Scale, Vote } from "lucide-react";
import type { VerificationResult } from "@/lib/contract";
import { cn } from "@/lib/utils";

const STAGES = [
  { key: "fetch", label: "Opening the submitted work", icon: Globe2 },
  { key: "leader", label: "Checking it against the requirements", icon: BrainCircuit },
  { key: "vote", label: "Independent reviewers are evaluating", icon: Vote },
  { key: "agree", label: "Finalizing the shared decision", icon: Scale },
];

export function VerificationProgress({
  active,
  result,
  disputeReason,
}: {
  active: boolean;
  result?: VerificationResult | null;
  disputeReason?: string;
}) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (!active) return;
    // Timer callbacks model the external consensus progress; scheduling the
    // reset avoids a synchronous state update inside the effect body.
    const timers = [
      setTimeout(() => setStage(0), 0),
      setTimeout(() => setStage(1), 650),
      setTimeout(() => setStage(2), 1400),
      setTimeout(() => setStage(3), 2250),
    ];
    return () => timers.forEach(clearTimeout);
  }, [active]);

  const votes = useMemo(() => result?.validators ?? [], [result]);

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--violet)]/30 bg-[var(--violet)]/[0.05]">
      <AnimatePresence mode="wait">
        {active && (
          <motion.div
            key="running"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative p-4"
          >
            <div className="scanline pointer-events-none absolute inset-0" />
            <p className="mb-3 flex items-center gap-2 text-sm font-medium text-[var(--violet)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Your work is being reviewed
              {disputeReason && <span className="text-[var(--amber)]">· reviewing your request again</span>}
            </p>
            <div className="space-y-2.5">
              {STAGES.map((s, i) => {
                const done = i < stage;
                const current = i === stage;
                return (
                  <div key={s.key} className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-full border",
                        done
                          ? "border-[var(--accent)]/50 bg-[var(--accent)]/10 text-[var(--accent)]"
                          : current
                            ? "border-[var(--violet)]/60 bg-[var(--violet)]/10 text-[var(--violet)]"
                            : "border-[var(--line)] text-[var(--faint)]"
                      )}
                    >
                      {done ? <Check className="h-3 w-3" /> : <s.icon className={cn("h-3 w-3", current && "animate-pulse")} />}
                    </span>
                    <span className={cn("text-xs", done || current ? "text-[var(--fg)]" : "text-[var(--faint)]")}>
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {!active && result && (
          <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4">
            <p className="mb-3 text-sm font-medium text-[var(--violet)]">
              Independent review results
            </p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {votes.map((v, i) => (
                <motion.div
                  key={v.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-2 rounded border border-[var(--line)] bg-black/30 px-2.5 py-2"
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      v.verdict === "verified" ? "bg-[var(--accent)]" : "bg-[var(--danger)]"
                    )}
                  />
                  <span className="flex-1 text-xs text-[var(--muted)]">Reviewer {i + 1}</span>
                  <span
                    className={cn(
                      "text-xs font-semibold",
                      v.verdict === "verified" ? "text-[var(--accent)]" : "text-[var(--danger)]"
                    )}
                  >
                    {v.verdict === "verified" ? "Accepted" : "Not accepted"} · {v.confidence}%
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
