"use client";

import { Ban, CheckCircle2, CircleDashed, Flag, Inbox, TimerOff, UserCheck, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const MAP: Record<
  string,
  { tone: "accent" | "violet" | "amber" | "danger" | "info" | "neutral"; label: string; icon: React.ElementType; pulse?: boolean }
> = {
  open: { tone: "info", label: "Available", icon: CircleDashed },
  claimed: { tone: "amber", label: "In progress", icon: UserCheck },
  submitted: { tone: "violet", label: "Under review", icon: Inbox },
  verified: { tone: "accent", label: "Accepted", icon: CheckCircle2 },
  rejected: { tone: "danger", label: "Not accepted", icon: XCircle },
  disputed: { tone: "amber", label: "Review requested", icon: Flag, pulse: true },
  cancelled: { tone: "neutral", label: "Cancelled", icon: Ban },
  expired: { tone: "neutral", label: "Expired", icon: TimerOff },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const cfg = MAP[status] ?? MAP.open;
  const Icon = cfg.icon;
  return (
    <Badge tone={cfg.tone} className={cn("gap-1", className)}>
      <Icon className={cn("h-3 w-3", cfg.pulse && "animate-pulse")} />
      {cfg.label}
    </Badge>
  );
}
