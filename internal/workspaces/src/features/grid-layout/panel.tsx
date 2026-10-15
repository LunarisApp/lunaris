import { PanelError } from "@lunarisapp/ui/components/panel-error";
import { LoaderView } from "@repo/features/loading";
import { log, parseError } from "evlog";
import { Component, type ErrorInfo, type ReactNode, Suspense } from "react";

interface ErrorBoundaryState {
  error: Error | null;
  hasError: boolean;
}

export class PanelErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    log.error({
      tag: "PanelError",
      error: parseError(error),
      componentStack: errorInfo.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <PanelError
          description={this.state.error?.message ?? "Unknown error"}
          title="Panel failed to load"
          variant="error"
        />
      );
    }
    return this.props.children;
  }
}

export function GridLayoutPanel({ children }: { children?: ReactNode }) {
  return (
    <PanelErrorBoundary>
      <Suspense fallback={<LoaderView />}>{children}</Suspense>
    </PanelErrorBoundary>
  );
}
