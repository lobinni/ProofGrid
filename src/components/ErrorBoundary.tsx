"use client";

import React from "react";
import { RotateCcw, Siren } from "lucide-react";
import { Button } from "@/components/ui/button";

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Unexpected rendering error",
    };
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6">
        <div className="w-full max-w-md rounded-lg border border-[var(--danger)]/30 bg-[var(--panel)] p-6 text-center">
          <Siren className="mx-auto h-8 w-8 text-[var(--danger)]" />
          <h2 className="mt-3 text-lg font-bold">Something broke in this view</h2>
          <p className="mt-2 break-words font-mono text-xs leading-relaxed text-[var(--muted)]">
            {this.state.message}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => {
              this.setState({ hasError: false, message: "" });
              window.location.reload();
            }}
          >
            <RotateCcw className="h-3 w-3" /> Reload
          </Button>
        </div>
      </div>
    );
  }
}
