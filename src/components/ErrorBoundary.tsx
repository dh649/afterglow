import { Component, type ReactNode } from "react";

/**
 * Catches a crash while drawing part of the app, so one bad page shows a
 * message instead of turning the whole window black. The error is saved to
 * localStorage ("afterglow.lastError") so it can be looked at later.
 */

interface Props {
  children: ReactNode;
  /** When this changes (for example, you navigate), the page gets another try. */
  resetKey?: string;
  fallback: (error: Error, retry: () => void) => ReactNode;
}

export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error("[Afterglow] page crashed", error, info.componentStack);
    try {
      localStorage.setItem(
        "afterglow.lastError",
        JSON.stringify({
          at: new Date().toISOString(),
          where: location.hash || "#/",
          message: String(error?.message ?? error),
          stack: String(error?.stack ?? "").slice(0, 2000),
          component: String(info.componentStack ?? "").slice(0, 1000),
        }),
      );
    } catch {
      /* storage blocked: nothing to save to */
    }
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    return this.state.error ? this.props.fallback(this.state.error, () => this.setState({ error: null })) : this.props.children;
  }
}

/** Shown in place of a page that crashed. The sidebar and player keep working. */
export function PageError({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <div className="page page-error" role="alert">
      <h1>This page hit a problem</h1>
      <p>The rest of Afterglow still works. Try loading the page again, or pick something else.</p>
      <div className="page-error-actions">
        <button className="pill-btn accent" onClick={retry}>
          Try again
        </button>
        <a className="pill-btn ghost" href="#/">
          Go home
        </a>
      </div>
      <p className="page-error-detail">If this keeps happening, screenshot this for Claude: {String(error?.message ?? error)}</p>
    </div>
  );
}

/** Last resort if the whole app crashes: a way back instead of a black window. */
export function AppError({ error }: { error: Error }) {
  return (
    <main className="setup" role="alert">
      <div className="setup-card glass">
        <h1>Afterglow hit a problem</h1>
        <p className="setup-lede">Reloading usually fixes it. Your music keeps playing in the meantime.</p>
        <button className="play-wide" onClick={() => location.reload()}>
          Reload
        </button>
        <p className="hint">If this keeps happening, screenshot this for Claude: {String(error?.message ?? error)}</p>
      </div>
    </main>
  );
}
