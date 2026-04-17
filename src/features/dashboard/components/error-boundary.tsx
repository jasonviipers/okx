"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { addLog } from "@/features/dashboard/hooks/use-log-store";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  label?: string;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const source = this.props.label ?? "Panel";
    addLog("ERROR", source, error.message, {
      componentStack: errorInfo.componentStack,
    });
    console.error(`[ErrorBoundary:${source}]`, error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center gap-2 p-4 text-xs text-destructive border border-destructive/30 bg-destructive/5">
          <div className="font-mono font-semibold uppercase">
            {this.props.label ?? "Panel"} Error
          </div>
          <div className="text-[0.625rem] font-mono text-muted-foreground max-h-20 overflow-auto">
            {this.state.error?.message ?? "An unexpected error occurred"}
          </div>
          <Button
            variant="outline"
            size="xs"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Retry
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
