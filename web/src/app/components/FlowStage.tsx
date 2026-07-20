"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import FlowPoolGrid from "./FlowPoolGrid";
import PageMast from "./PageMast";
import type { FlowWindow } from "@/lib/flow";
import { SITE_URL } from "@/lib/site";

export type SerializableSnapshot = {
  window: FlowWindow;
  since: number;
  deposits: Array<{
    id: string;
    pool: "0.1" | "1" | "10" | "100";
    amountWei: string;
    from: string;
    timestamp: number;
    blockNumber: number;
    txHash: string;
  }>;
  withdrawals: Array<{
    id: string;
    pool: "0.1" | "1" | "10" | "100";
    amountWei: string;
    to: string;
    relayer: string;
    feeWei: string;
    timestamp: number;
    blockNumber: number;
    txHash: string;
  }>;
  inWei: string;
  outWei: string;
  feeWei: string;
  depositCount: number;
  withdrawalCount: number;
  truncated: boolean;
  indexing: boolean;
  indexedBlock: number | null;
};

type Props = {
  snapshots: Record<FlowWindow, SerializableSnapshot>;
};

/**
 * Tornado flow stage: brand mast, glass screen with pool-grid mosaic,
 * methodology + back link. Public surface is flow.shhheth.com only.
 */
export default function FlowStage({ snapshots }: Props) {
  const [cursorInStage, setCursorInStage] = useState(false);
  const stageRef = useRef<HTMLElement | null>(null);
  const stageRectRef = useRef<DOMRect | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const refresh = () => {
      stageRectRef.current = stage.getBoundingClientRect();
    };
    const invalidate = () => {
      stageRectRef.current = null;
    };
    refresh();
    const observer = new ResizeObserver(refresh);
    observer.observe(stage);
    window.addEventListener("scroll", invalidate, { passive: true, capture: true });
    window.addEventListener("resize", refresh, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", invalidate, { capture: true });
      window.removeEventListener("resize", refresh);
    };
  }, []);

  const updateCursor = useCallback((event: PointerEvent<HTMLElement>) => {
    const target = event.currentTarget;
    let stageRect = stageRectRef.current;
    if (!stageRect) {
      stageRect = target.getBoundingClientRect();
      stageRectRef.current = stageRect;
    }
    target.style.setProperty("--lens-x", `${event.clientX - stageRect.left}px`);
    target.style.setProperty("--lens-y", `${event.clientY - stageRect.top}px`);
  }, []);

  return (
    <section
      ref={stageRef}
      className={`lens-stage flow-stage${cursorInStage ? " lens-stage-cursor-in" : ""}`}
      onPointerMove={updateCursor}
      onPointerEnter={() => setCursorInStage(true)}
      onPointerLeave={() => setCursorInStage(false)}
    >
      <div className="ambient-noise" aria-hidden="true" />
      <div className="page-pattern" aria-hidden="true" />

      <PageMast view="flow" />

      <div className="screen-frame flow-screen-frame" aria-hidden={false}>
        <div className="screen-glow" />
        <div className="screen-surface" />
        <div className="screen-content flow-screen-content">
          <FlowPoolGrid snapshots={snapshots} />
        </div>
      </div>

      <div className="below-fold">
        <section className="methodology-section" aria-label="How to read flow">
          <h2 className="methodology-title">
            <span className="methodology-title-heavy">Tornado Cash Flow.</span>
            <span className="methodology-title-soft">Deposits in, withdrawals out.</span>
          </h2>
          <div className="methodology-body">
            <p>
              This page is not the full quiet index. It shows Tornado Cash ETH
              pools only: public deposits on one side, withdrawals on the other,
              pool in the center. Moving cubes are atmosphere only. They never
              pair a real deposit with a real withdrawal.
            </p>
            <p>
              Tap a size to filter. Scroll either list for more history. Relayer
              fees are the window total above the pool, static for the selected
              range. All protocols together live on the{" "}
              <a href={SITE_URL} className="flow-inline-link">
                quiet index
              </a>
              .
            </p>
          </div>
        </section>
        <footer className="site-footer">
          <a href={SITE_URL}>Back to quiet index</a>
        </footer>
      </div>
    </section>
  );
}
