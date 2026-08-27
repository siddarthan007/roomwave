import { Component, type ErrorInfo, type ReactNode } from "react";

import { BlockButton } from "./ui";

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main id="roomwave-main" className="grid min-h-dvh place-items-center px-6">
        <div className="max-w-md text-center">
          <p className="mono-tag text-[var(--red)]">the room hiccuped</p>
          <p className="mt-4 text-lg font-bold">
            Reload this page. Your seat and recorded answers stay on this device.
          </p>
          <div className="mt-6">
            <BlockButton onClick={() => window.location.reload()} wide color="var(--yellow)">
              reload
            </BlockButton>
          </div>
        </div>
      </main>
    );
  }
}
