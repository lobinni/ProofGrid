"use client";

// Numeric tile for dashboards and the landing strip: mono index, label,
// big value, and a quiet caption. The value counts up on mount.

import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { cn } from "@/lib/utils";

export function StatTile({
  index,
  label,
  value,
  suffix,
  caption,
  icon: Icon,
  tone = "default",
  decimals = 0,
}: {
  index?: string;
  label: string;
  value: number;
  suffix?: string;
  caption?: string;
  icon?: React.ElementType;
  tone?: "default" | "accent" | "violet" | "amber";
  decimals?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const start = performance.now();
    const dur = 900;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(value * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value]);

  const tones = {
    default: "text-[var(--fg)]",
    accent: "text-[var(--accent)]",
    violet: "text-[var(--violet)]",
    amber: "text-[var(--amber)]",
  };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 14 }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.45 }}
      className="relative overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4"
    >
      <div className="flex items-center justify-between">
        {index ? <span className="text-[11px] text-[var(--faint)]">{index}</span> : <span />}
        {Icon && <Icon className="h-4 w-4 text-[var(--muted)]" />}
      </div>
      <p className={cn("mt-2 text-2xl font-bold tabular-nums tracking-tight sm:text-3xl", tones[tone])}>
        {display.toLocaleString("en-US", { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}
        {suffix && <span className="ml-1.5 text-xs font-medium text-[var(--muted)]">{suffix}</span>}
      </p>
      <p className="mt-1 text-[11.5px] tracking-normal text-[var(--muted)]">{label}</p>
      {caption && <p className="mt-0.5 text-[11.5px] text-[var(--faint)]">{caption}</p>}
    </motion.div>
  );
}
