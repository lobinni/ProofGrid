"use client";

// Page-level toolbar: an indexed title block on the left, contextual actions
// and filters on the right.

import { motion } from "framer-motion";

export function Toolbar({
  index,
  title,
  description,
  children,
}: {
  index?: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mb-6 flex flex-wrap items-end justify-between gap-4"
    >
      <div className="flex items-start gap-3">
        {index && <span className="mt-1 text-xs text-[var(--faint)]">{index}</span>}
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--fg)] sm:text-2xl">{title}</h1>
          {description && <p className="mt-1 max-w-xl text-[13px] text-[var(--muted)]">{description}</p>}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </motion.div>
  );
}
