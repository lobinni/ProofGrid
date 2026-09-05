"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  BrainCircuit,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  LayoutGrid,
  Lock,
  RefreshCw,
  Search,
  Zap,
} from "lucide-react";
import { StatTile } from "@/components/StatTile";
import { StatusBadge } from "@/components/StatusBadge";
import { Toolbar } from "@/components/shell/Toolbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { useTasks, type OnChainTask } from "@/hooks/useTasks";
import { cn, formatCountdown, formatGEN } from "@/lib/utils";

const STATUS_FILTERS = ["all", "open", "claimed", "submitted", "verified", "rejected", "disputed", "cancelled", "expired"] as const;
const STATUS_LABELS: Record<(typeof STATUS_FILTERS)[number], string> = {
  all: "All tasks",
  open: "Available",
  claimed: "In progress",
  submitted: "Under review",
  verified: "Accepted",
  rejected: "Not accepted",
  disputed: "Review requested",
  cancelled: "Cancelled",
  expired: "Expired",
};

function TaskCard({ task, i }: { task: OnChainTask; i: number }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.35, delay: Math.min(i * 0.04, 0.3) }}
    >
      <Link href={`/task/${task.contractAddress}`}>
        <Card interactive className="group h-full p-4">
          <div className="flex items-center justify-end">
            <StatusBadge status={task.status} />
          </div>
          <h3 className="mt-3 line-clamp-2 text-[15px] font-semibold leading-snug text-[var(--fg)] transition-colors group-hover:text-[var(--accent)]">
            {task.title}
          </h3>
          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[var(--muted)]">{task.description}</p>

          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <span className="rounded border border-[var(--line)] px-1.5 py-0.5 text-[11px] tracking-normal text-[var(--muted)]">
              {task.category}
            </span>
            <span
              className={cn(
                "rounded border px-1.5 py-0.5 text-[11px] tracking-normal",
                task.priority === "Critical"
                  ? "border-[var(--danger)]/40 text-[var(--danger)]"
                  : task.priority === "High"
                    ? "border-[var(--amber)]/40 text-[var(--amber)]"
                    : "border-[var(--line)] text-[var(--muted)]"
              )}
            >
              {task.priority}
            </span>
            <span className="flex items-center gap-1 rounded border border-[var(--line)] px-1.5 py-0.5 text-[11px] tracking-normal text-[var(--muted)]">
              <Clock3 className="h-2.5 w-2.5" /> {formatCountdown(task.deadline)}
            </span>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-[var(--line)] pt-3">
            <span className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--accent)]">
              <Lock className="h-3 w-3 text-[var(--muted)]" />
              {formatGEN(task.reward_amount)}
            </span>
            <span className="flex items-center gap-1 text-[11.5px] tracking-normal text-[var(--faint)] transition-colors group-hover:text-[var(--fg)]">
              Open <ChevronRight className="h-3 w-3" />
            </span>
          </div>
        </Card>
      </Link>
    </motion.div>
  );
}

export default function BoardPage() {
  const { tasks, loading, error, refresh } = useTasks();
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("all");
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const categories = useMemo(() => ["all", ...Array.from(new Set(tasks.map((t) => t.category)))], [tasks]);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (status !== "all" && t.status !== status) return false;
      if (category !== "all" && t.category !== category) return false;
      if (query) {
        const q = query.toLowerCase();
        if (!t.title.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [tasks, status, category, query]);

  const stats = useMemo(
    () => ({
      total: tasks.length,
      open: tasks.filter((t) => t.status === "open").length,
      locked: tasks.filter((t) => !t.escrowReleased).reduce((a, t) => a + t.escrowLocked, 0),
      verified: tasks.filter((t) => t.status === "verified").length,
    }),
    [tasks]
  );

  return (
    <div>
      {error && (
        <div className="mb-5 rounded-lg border border-[var(--amber)]/30 bg-[var(--amber)]/5 px-4 py-3 text-sm leading-relaxed text-[var(--amber)]">
          {error}
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Total tasks" value={stats.total} icon={LayoutGrid} />
        <StatTile label="Available now" value={stats.open} tone="accent" icon={Zap} />
        <StatTile label="Rewards secured" value={stats.locked} suffix="GEN" tone="amber" icon={Lock} />
        <StatTile label="Work accepted" value={stats.verified} tone="violet" icon={BrainCircuit} />
      </div>

      <Toolbar
        title="Task board"
        description="Explore funded tasks, claim work that fits your skills, and earn rewards when your submission is accepted."
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--faint)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks…"
            className="h-9 w-44 rounded-md border border-[var(--line)] bg-black/30 pl-8 pr-3 text-xs text-[var(--fg)] outline-none transition-colors focus:border-[var(--accent)]/60 sm:w-52"
          />
        </div>
        <Select value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 w-36 text-xs">
          {categories.map((c) => (
            <option key={c} value={c}>
              {c === "all" ? "All categories" : c}
            </option>
          ))}
        </Select>
        <Button variant="ghost" size="sm" onClick={refresh} loading={loading}>
          <RefreshCw className="h-3 w-3" /> Refresh
        </Button>
        <Link href="/create">
          <Button size="sm">
            <CircleDollarSign className="h-3 w-3" /> Post task
          </Button>
        </Link>
      </Toolbar>

      <div className="mb-5 flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={cn(
              "cursor-pointer rounded-full border px-3 py-1 text-[11.5px] tracking-normal transition-all",
              status === s
                ? "border-[var(--accent)]/60 bg-[var(--accent)]/10 text-[var(--accent)]"
                : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--line-strong)] hover:text-[var(--fg)]"
            )}
          >
            {STATUS_LABELS[s]}
            {s !== "all" && (
              <span className="ml-1.5 text-[var(--faint)]">{tasks.filter((t) => t.status === s).length}</span>
            )}
          </button>
        ))}
      </div>

      {loading && tasks.length === 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--line-strong)] py-16 text-center">
          <p className="text-xs tracking-normal text-[var(--faint)]">No tasks match these filters</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((task, i) => (
              <TaskCard key={task.contractAddress} task={task} i={i} />
            ))}
          </AnimatePresence>
        </div>
      )}

    </div>
  );
}
