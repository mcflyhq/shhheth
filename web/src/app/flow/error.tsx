"use client";

import { useEffect } from "react";
import { SITE_URL } from "@/lib/site";

export default function FlowError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[flow] route error:", error);
  }, [error]);

  return (
    <main className="flow-error-page">
      <div className="flow-error-card" role="alert">
        <p className="flow-error-kicker">tornado flow</p>
        <h1 className="flow-error-title">Could not open Tornado flow</h1>
        <p className="flow-error-body">
          Something failed while loading Tornado Cash pool flow. Try again. If
          it keeps happening, go back to the quiet index.
        </p>
        <div className="flow-error-actions">
          <button type="button" className="flow-error-btn" onClick={reset}>
            Try again
          </button>
          <a href={SITE_URL} className="flow-error-link">
            Back to quiet index
          </a>
        </div>
      </div>
    </main>
  );
}
