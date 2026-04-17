"use client";

import { type ReactNode, Suspense } from "react";

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
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <Suspense fallback={<PanelSkeleton label={label} />}>{children}</Suspense>
  );
}
