import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md border border-[var(--line)] bg-white/[0.04]",
        className
      )}
    />
  );
}
