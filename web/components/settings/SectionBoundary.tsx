"use client";

import { Component } from "react";

interface Props {
  /** What the section is, in the sentence shown if it fails: "Your links couldn't be loaded." */
  what: string;
  children: React.ReactNode;
}

/**
 * Keeps one settings section failing from taking the rest of the page with it. The error itself
 * is logged on the server; the reader is told what happened and what to do.
 */
export class SectionBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <p className="notice notice-error" role="alert" data-testid="settings-section-error">
        {this.props.what} couldn&apos;t be loaded. Reload the page to try again.
      </p>
    );
  }
}
