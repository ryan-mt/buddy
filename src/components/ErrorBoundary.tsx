import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last line of defense: a render crash shows a recoverable glass panel instead
 * of a white screen. Reloading is safe — the workspace snapshot offers to
 * restore every session, and Claude resumes its conversations.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("buddy render crash:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="atmosphere grain flex h-screen items-center justify-center bg-[var(--color-bg)] px-6 text-[var(--color-text)]">
        <div className="glass-strong relative flex max-w-md flex-col items-center gap-3 rounded-2xl border border-[var(--glass-border)] px-8 py-7 text-center">
          <span className="text-[15px] font-semibold">Something broke</span>
          <p className="max-h-32 overflow-auto font-mono text-[12px] leading-relaxed text-[var(--color-text-muted)]">
            {this.state.error.message}
          </p>
          <p className="text-[12px] text-[var(--color-text-faint)]">
            Your sessions are saved — buddy will offer to restore them.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-1 rounded-xl bg-[var(--color-accent)] px-4 py-2 text-[13px] font-semibold text-[var(--color-accent-contrast)] transition hover:brightness-110"
          >
            Reload buddy
          </button>
        </div>
      </div>
    );
  }
}
