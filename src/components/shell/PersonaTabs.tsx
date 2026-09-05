"use client";

// Persona-tab navigation - the app's working surfaces (Board / Create /
// Dashboard) presented as a tab strip under the title bar.

import { motion } from "framer-motion";
import { CirclePlus, Gauge, LayoutGrid } from "lucide-react";
import { NavLink } from "@/components/NavLink";

const TABS = [
  { href: "/", label: "Board", icon: LayoutGrid, match: (p: string) => p === "/" || p.startsWith("/task") },
  { href: "/create", label: "Create", icon: CirclePlus, match: (p: string) => p.startsWith("/create") },
  { href: "/dashboard", label: "Dashboard", icon: Gauge, match: (p: string) => p.startsWith("/dashboard") },
];

export function PersonaTabs() {
  return (
    <nav className="sticky top-14 z-30 border-b border-[var(--line)] bg-[var(--bg)]/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1200px] items-end gap-1 px-4 sm:px-6">
        {TABS.map((tab) => (
          <NavLink key={tab.href} href={tab.href} isActive={tab.match}>
            {(active) => (
              <span className="relative flex cursor-pointer items-center gap-2 px-3.5 py-3 text-[11px] tracking-normal">
                <tab.icon className={`h-3.5 w-3.5 ${active ? "text-[var(--accent)]" : "text-[var(--faint)]"}`} />
                <span className={active ? "text-[var(--fg)]" : "text-[var(--muted)]"}>{tab.label}</span>
                {active && (
                  <motion.span
                    layoutId="persona-tab-underline"
                    className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[var(--accent)] shadow-[0_0_12px_var(--accent)]"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
              </span>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
