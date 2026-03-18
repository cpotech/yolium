import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackLabel?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error(`[ErrorBoundary] ${this.props.fallbackLabel ?? 'Component'} crashed:`, error, info.componentStack);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      const label = this.props.fallbackLabel ?? 'This section';
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-[var(--color-bg-primary)]">
          <div className="text-[var(--color-status-error)] text-sm font-medium mb-2">
            {label} encountered an error
          </div>
          <div className="text-xs text-[var(--color-text-muted)] mb-4 max-w-md break-words">
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </div>
          <button
            onClick={this.handleRetry}
            className="px-3 py-1.5 text-sm bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-hover)] text-[var(--color-text-primary)] rounded border border-[var(--color-border-primary)] transition-colors"
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
