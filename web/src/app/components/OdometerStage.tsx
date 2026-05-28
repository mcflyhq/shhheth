"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import BraunDigits from "./BraunDigits";
import SiteHeader from "./SiteHeader";
import type { DisplayProtocol } from "@/lib/subgraph";

type Props = {
  formattedTotal: string;
  isLive: boolean;
  protocols: DisplayProtocol[];
  children?: React.ReactNode;
};

export default function OdometerStage({ formattedTotal, isLive, protocols, children }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
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

  const hovered = useMemo(
    () => (hoveredId ? protocols.find((p) => p.id === hoveredId) ?? null : null),
    [hoveredId, protocols],
  );

  const displayValue = hovered ? hovered.formattedETH : formattedTotal;
  const sublabel = hovered
    ? `${hovered.name} · ${hovered.percentage.toFixed(1)}% of the total`
    : "Has been told to shhh across privacy protocols";

  return (
    <section
      ref={stageRef}
      className="lens-stage"
      onPointerMove={updateCursor}
    >
      <div className="ambient-noise" aria-hidden="true" />
      <div className="page-pattern" aria-hidden="true" />
      <SiteHeader />

      <div className="page-mast">
        <h1 className="hero-shhh-logo" aria-label="shhh — the quiet index">
          <svg
            className="hero-shhh"
            viewBox="0 0 760 220"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-hidden="true"
          >
            <text
              x="40"
              y="58%"
              textAnchor="start"
              dominantBaseline="middle"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinejoin="round"
              strokeLinecap="round"
              className="hero-shhh-text"
            >
              shhh
            </text>
            <circle
              cx="640"
              cy="148"
              r="40"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
            />
            <text
              x="640"
              y="162"
              textAnchor="middle"
              dominantBaseline="middle"
              className="hero-shhh-emoji"
            >
              🤫
            </text>
          </svg>
        </h1>
        <p className="hero-subtitle">The quiet index for shielded ETH.</p>
      </div>

      <div className="screen-frame" aria-hidden="true">
        <div className="screen-glow" />
        <div className="screen-surface" />
        <div className="screen-content">
          <div className="screen-digits">
            <BraunDigits value={displayValue} />
            <p className="screen-sublabel">
              <span className={`live-dot ${isLive ? "live-dot-on" : "live-dot-off"}`} aria-hidden="true" />
              {sublabel}
            </p>
          </div>

          {protocols.length > 0 && (
            <div className="breakdown">
              <div className="breakdown-heading">
                <span>Live aggregate</span>
                <span className="breakdown-heading-sep" aria-hidden="true">·</span>
                <span>updated every minute</span>
              </div>
              <div className="screen-breakdown" role="group" aria-label="Per-protocol share of all-time shielded ETH">
                {protocols.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`breakdown-segment${hoveredId === p.id ? " is-active" : ""}`}
                    style={{
                      width: `${Math.max(p.percentage, 1.5)}%`,
                      ["--seg-color" as string]: p.color,
                    }}
                    onMouseEnter={() => setHoveredId(p.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onFocus={() => setHoveredId(p.id)}
                    onBlur={() => setHoveredId(null)}
                    aria-label={`${p.name}: ${p.formattedETH} ETH, ${p.percentage.toFixed(1)} percent of total`}
                  >
                    <span className="breakdown-segment-label">{p.name.toLowerCase()}</span>
                    <span className="breakdown-segment-pct">{p.percentage.toFixed(1)}%</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="below-fold">
        {children}
        <footer className="site-footer">
          <span>built for people who prefer silence</span>
          <span className="site-footer-sep" aria-hidden="true">·</span>
          <span>we see the proof. we don&apos;t tell.</span>
        </footer>
      </div>
    </section>
  );
}
