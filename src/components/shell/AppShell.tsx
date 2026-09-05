"use client";

// Desktop-app-style shell that wraps every page: a title bar with persona
// tabs, network badge and wallet, a page content well, and a status bar.

import React from "react";
import { PersonaTabs } from "./PersonaTabs";
import { StatusBar } from "./StatusBar";
import { TitleBar } from "./TitleBar";
import { Toaster } from "@/components/ui/toast";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)] text-[var(--fg)]">
      <div className="bg-grid pointer-events-none fixed inset-0 opacity-[0.5]" />
      <div className="bg-glow pointer-events-none fixed inset-0" />
      <TitleBar />
      <PersonaTabs />
      <main className="relative z-10 mx-auto w-full max-w-[1200px] flex-1 px-4 pb-24 pt-6 sm:px-6">
        {children}
      </main>
      <StatusBar />
      <Toaster />
    </div>
  );
}
