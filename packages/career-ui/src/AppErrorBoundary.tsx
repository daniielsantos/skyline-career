import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Last-resort UI when a render throws — avoids an opaque blank root.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[skyline] UI crash', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="app-shell profile-gate-shell" role="alert">
        <section className="panel profile-gate">
          <h1>Something went wrong</h1>
          <p className="muted">
            The career UI hit an unexpected error. Reload the page to continue.
          </p>
          <pre className="banner error" style={{ whiteSpace: 'pre-wrap' }}>
            {this.state.error.message}
          </pre>
          <button
            type="button"
            className="action accept"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </section>
      </div>
    );
  }
}
