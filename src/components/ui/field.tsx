"use client";

import { cn } from "@/lib/utils";

const base =
  "w-full rounded-md border border-[var(--line)] bg-black/30 px-3 py-2.5 text-[13px] text-[var(--fg)] placeholder:text-[var(--faint)] outline-none transition-colors focus:border-[var(--accent)]/60 focus:ring-2 focus:ring-[var(--accent)]/15 disabled:opacity-50";

export function Label({ className, children, htmlFor }: { className?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn("mb-1.5 flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--muted)]", className)}>
      {children}
    </label>
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(base, className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(base, "min-h-[96px] resize-y leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(base, "cursor-pointer appearance-none bg-black/30 pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label>
        {label}
        {hint && <span className="ml-auto font-normal normal-case tracking-normal text-[var(--faint)]">{hint}</span>}
      </Label>
      {children}
    </div>
  );
}
