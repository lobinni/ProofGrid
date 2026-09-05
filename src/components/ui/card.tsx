import { cn } from "@/lib/utils";

export function Card({
  className,
  interactive,
  children,
}: {
  className?: string;
  interactive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative rounded-lg border border-[var(--line)] bg-[var(--panel)]",
        interactive &&
          "transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--line-strong)] hover:shadow-[0_12px_40px_-16px_rgba(0,0,0,0.8)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3", className)}>
      {children}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("px-4 py-3", className)}>{children}</div>;
}
