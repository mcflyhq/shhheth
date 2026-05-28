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
  const [onScreen, setOnScreen] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);
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

    const screen = screenRef.current;
    if (!screen) {
      setOnScreen((prev) => (prev ? false : prev));
      return;
    }

    const screenRect = screen.getBoundingClientRect();
    const inside =
      event.clientX >= screenRect.left &&
      event.clientX <= screenRect.right &&
      event.clientY >= screenRect.top &&
      event.clientY <= screenRect.bottom;

    setOnScreen((prev) => (prev === inside ? prev : inside));
  }, []);

  const leaveStage = useCallback(() => {
    setOnScreen(false);
  }, []);

  const hovered = useMemo(
    () => (hoveredId ? protocols.find((p) => p.id === hoveredId) ?? null : null),
    [hoveredId, protocols],
  );

  const displayValue = hovered ? hovered.formattedETH : formattedTotal;
  const displayLabel = hovered
    ? `${hovered.name} · ${hovered.percentage.toFixed(1)}% of total`
    : "ETH · ever shielded · and counting";

  const className = ["lens-stage", onScreen ? "lens-active" : "lens-idle"]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      ref={stageRef}
      className={className}
      onPointerMove={updateCursor}
      onPointerEnter={updateCursor}
      onPointerLeave={leaveStage}
    >
      <div className="ambient-noise" aria-hidden="true" />
      <SiteHeader />

      <div className="screen-frame" ref={screenRef} aria-hidden="true">
        <div className="screen-glow" />
        <div className="screen-surface" />
        <div className="screen-content">
          <div className="screen-digits">
            <BraunDigits value={displayValue} />
            <p className="screen-sublabel">
              <span className={`live-dot ${isLive ? "live-dot-on" : "live-dot-off"}`} aria-hidden="true" />
              {displayLabel}
            </p>
          </div>

          {protocols.length > 0 && (
            <div className="breakdown">
              <p className="breakdown-heading">
                <span>by protocol</span>
                <span className="breakdown-heading-sep" aria-hidden="true">·</span>
                <span>ETH only</span>
              </p>
              <div className="screen-breakdown" role="group" aria-label="Breakdown by protocol, ETH only">
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

      <div className="lens-halo" aria-hidden="true" />

      <div className="below-fold">
        <div className="hero-tagline">
          <p className="hero-shhh" aria-hidden="true">shhh.</p>
          <h1 className="hero-line">
            <span className="hero-line-heavy">Every ETH that ever went private.</span>
            <span className="hero-line-soft">Counted. And counting.</span>
          </h1>
        </div>
        {children}
        <footer className="site-footer">
          <span>built by anon · for anon</span>
          <span className="site-footer-sep" aria-hidden="true">·</span>
          <span>we see the proof. we don&apos;t tell.</span>
        </footer>
      </div>
    </section>
  );
}
