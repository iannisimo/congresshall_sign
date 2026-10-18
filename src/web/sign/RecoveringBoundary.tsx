import { Component, type ReactNode } from 'react';
import { canReload } from './hooks.ts';
import { strings } from './strings.ts';

const RETRY_AFTER = 30_000;

/** Nobody is there to press F5: after a crash, show a calm message and reload by itself. */
export class RecoveringBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  private timer: ReturnType<typeof setInterval> | undefined;

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
    // Keep trying until a reload can actually succeed.
    this.timer = setInterval(() => canReload() && location.reload(), RETRY_AFTER);
  }

  componentWillUnmount() {
    clearInterval(this.timer);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="grid h-screen place-items-center bg-canvas text-[2rem] font-semibold text-slate-400">{strings.restarting}</div>
    );
  }
}
