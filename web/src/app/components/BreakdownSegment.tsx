"use client";

import { memo, useCallback } from "react";
import type { DisplayProtocol } from "@/lib/subgraph";

type Props = {
  protocol: DisplayProtocol;
  isActive: boolean;
  onActivate: (id: string) => void;
  onDeactivate: () => void;
};

/**
 * One segment of the breakdown bar. Memoized so that hovering segment A
 * only re-renders A (gets is-active) and the previously-active B (loses
 * it) — the other 2 segments skip.
 */
function BreakdownSegment({ protocol, isActive, onActivate, onDeactivate }: Props) {
  const handleEnter = useCallback(() => onActivate(protocol.id), [onActivate, protocol.id]);
  const handleLeave = useCallback(() => onDeactivate(), [onDeactivate]);

  return (
    <button
      type="button"
      className={`breakdown-segment${isActive ? " is-active" : ""}`}
      style={{
        width: `${Math.max(protocol.percentage, 1.5)}%`,
        ["--seg-color" as string]: protocol.color,
      }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
      aria-label={`${protocol.name}: ${protocol.formattedETH} ETH, ${protocol.percentage.toFixed(1)} percent of total`}
    >
      <span className="breakdown-segment-label">{protocol.name.toLowerCase()}</span>
      <span className="breakdown-segment-pct">{protocol.percentage.toFixed(1)}%</span>
    </button>
  );
}

export default memo(BreakdownSegment);
