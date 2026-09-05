import { cn } from "@/lib/utils";

const tones: Record<string, string> = {
  neutral: "border-[var(--line-strong)] bg-white/[0.03] text-[var(--muted)]",
  accent: "border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)]",
  violet: "border-[var(--violet)]/40 bg-[var(--violet)]/10 text-[var(--violet)]",
  amber: "border-[var(--amber)]/40 bg-[var(--amber)]/10 text-[var(--amber)]",
  danger: "border-[var(--danger)]/40 bg-[var(--danger)]/10 text-[var(--danger)]",
  info: "border-[var(--info)]/40 bg-[var(--info)]/10 text-[var(--info)]",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: keyof typeof tones;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11.5px] font-medium tracking-normal",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
