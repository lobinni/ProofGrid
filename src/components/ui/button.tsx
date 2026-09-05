"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "outline" | "ghost" | "danger" | "violet";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

const variants: Record<string, string> = {
  primary:
    "bg-[var(--accent)] text-black hover:bg-[var(--accent-hi)] shadow-[0_0_24px_-6px_var(--accent)] hover:shadow-[0_0_32px_-4px_var(--accent)]",
  outline:
    "border border-[var(--line-strong)] bg-transparent text-[var(--fg)] hover:border-[var(--accent)] hover:text-[var(--accent)]",
  ghost: "bg-transparent text-[var(--muted)] hover:text-[var(--fg)] hover:bg-white/5",
  danger:
    "border border-[var(--danger)]/40 bg-[var(--danger)]/10 text-[var(--danger)] hover:bg-[var(--danger)]/20",
  violet:
    "bg-[var(--violet)] text-white hover:brightness-110 shadow-[0_0_24px_-6px_var(--violet)]",
};

const sizes: Record<string, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-[13px] gap-2",
  lg: "h-12 px-6 text-sm gap-2",
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  loading,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-md font-semibold tracking-normal transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none active:scale-[0.98]",
        variants[variant],
        sizes[size],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}
