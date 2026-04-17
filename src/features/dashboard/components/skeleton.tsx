"use client";

import { type ReactNode } from "react";

export function PanelSkeleton({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-full min-h-[120px] animate-pulse-soft">
      <div className="flex flex-col items-center gap-2 text-muted-foreground">
        <div className="h-3 w-20 bg-muted rounded" />
        <div className="text-[0.625rem] font-mono uppercase tracking-wider">
          {label}
        </div>
      </div>
    </div>
  );
}

export function PanelSuspense({
  children,
  label,
  loading = false,
}: {
  children: ReactNode;
  label: string;
  loading?: boolean;
}) {
  if (loading) {
    return <PanelSkeleton label={label} />;
  }
  return <>{children}</>;
}
