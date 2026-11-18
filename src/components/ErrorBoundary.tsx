import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Last line of defence: a broken screen shows a way out instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ShieldOps UI error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-lg border border-line bg-surface p-6 text-sm">
          <h1 className="text-base font-semibold">This screen stopped working</h1>
          <p className="mt-1 text-muted">{this.state.error.message}</p>
          <div className="mt-4 flex gap-2">
            <button type="button" className="rounded border border-line px-3 py-1.5 font-medium hover:bg-sunken" onClick={() => window.location.reload()}>
              Reload
            </button>
            <button type="button" className="rounded px-3 py-1.5 text-muted hover:text-ink" onClick={() => window.location.assign('/')}>
              Go to the dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }
}