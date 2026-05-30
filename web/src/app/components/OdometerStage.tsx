"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import BraunDigits from "./BraunDigits";
import BreakdownSegment from "./BreakdownSegment";
import ShareButton from "./ShareButton";
import RangeToggle from "./RangeToggle";
import InflowChart from "./InflowChart";
import type { DisplayProtocol } from "@/lib/subgraph";
import type { RangeView } from "../page";
import type { RangeKey } from "@/lib/daily";

type DeltaView = { flat: boolean; primary: string; secondary: string };

type Props = {
  formattedTotal: string;
  isLive: boolean;
  protocols: DisplayProtocol[];
  ranges: RangeView[];
  shareText: string;
  shareUrl: string;
  children?: React.ReactNode;
};

export default function OdometerStage({
  formattedTotal,
  isLive,
  protocols,
  ranges,
  shareText,
  shareUrl,
  children,
}: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [activeRange, setActiveRange] = useState<RangeKey>("7d");
  const view = ranges.find((r) => r.key === activeRange) ?? ranges[0];
  const order = ranges[0].points[0]?.values.map((v) => ({ id: v.id, color: v.color })) ?? [];
  const [cursorInStage, setCursorInStage] = useState(false);
  const [letterBox, setLetterBox] = useState({ x: 0, w: 360 });
  const stageRef = useRef<HTMLElement | null>(null);
  const stageRectRef = useRef<DOMRect | null>(null);
  const shhhTextRef = useRef<SVGTextElement | null>(null);

  /* Snap the letter SVG's viewBox to the actual rendered text. Without this,
   * the SVG carries a fixed-width box of empty pixels to the right of "shhh",
   * which pushes the dot away from the letters in the flex row. */
  useLayoutEffect(() => {
    const measure = () => {
      if (!shhhTextRef.current) return;
      const bbox = shhhTextRef.current.getBBox();
      if (bbox.width > 0) {
        setLetterBox({
          x: Math.floor(bbox.x),
          w: Math.ceil(bbox.width + 4),
        });
      }
    };
    measure();
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(measure).catch(() => {});
    }
    window.addEventListener("resize", measure, { passive: true });
    return () => window.removeEventListener("resize", measure);
  }, []);

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

  // Stable handlers — passed as props to memoized BreakdownSegment so the
  // segments don't re-render just because a closure was re-created.
  const handleSegmentActivate = useCallback((id: string) => setHoveredId(id), []);
  const handleSegmentDeactivate = useCallback(() => setHoveredId(null), []);

  const displayValue = hovered ? hovered.formattedETH : formattedTotal;
  const sublabel = hovered
    ? `${hovered.name} · ${hovered.percentage.toFixed(1)}% of the total`
    : "Has been shielded across privacy protocols";

  const deltaView: DeltaView | null = useMemo(() => {
    if (hovered) {
      const b = view.byProtocol[hovered.id];
      if (!b) return null;
      return {
        flat: b.zero,
        primary: b.zero ? "flat" : `${b.formatted} ETH`,
        secondary: !b.zero && b.sharePct !== null ? `${b.sharePct.toFixed(0)}% of ${view.label}` : view.label,
      };
    }
    return {
      flat: view.delta.zero,
      primary: view.delta.zero ? "flat" : `${view.delta.formatted} ETH`,
      secondary: view.label,
    };
  }, [hovered, view]);

  return (
    <section
      ref={stageRef}
      className={`lens-stage${cursorInStage ? " lens-stage-cursor-in" : ""}`}
      onPointerMove={updateCursor}
      onPointerEnter={() => setCursorInStage(true)}
      onPointerLeave={() => setCursorInStage(false)}
    >
      <div className="ambient-noise" aria-hidden="true" />
      <div className="page-pattern" aria-hidden="true" />

      <div className="page-mast">
        <h1 className="hero-shhh-logo" aria-label="shhh — the quiet index">
          <svg
            className="hero-shhh-letters"
            viewBox={`${letterBox.x} 0 ${letterBox.w} 200`}
            preserveAspectRatio="xMidYMax meet"
            role="img"
            aria-hidden="true"
          >
            <text
              ref={shhhTextRef}
              x="0"
              y="178"
              textAnchor="start"
              dominantBaseline="alphabetic"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinejoin="round"
              strokeLinecap="round"
              className="hero-shhh-text"
            >
              shhh
            </text>
          </svg>
          <span className="hero-shhh-dot" aria-hidden="true">
            <svg className="hero-shhh-dot-ring" viewBox="0 0 100 100" aria-hidden="true">
              <circle
                cx="50"
                cy="50"
                r="46"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <span className="hero-shhh-emoji">🤫</span>
          </span>
        </h1>
        <p className="hero-subtitle">The quiet index for shielded ETH.</p>
      </div>

      <div className="screen-frame" aria-hidden="true">
        <div className="screen-glow" />
        <div className="screen-surface" />
        <div className="screen-content">
          <div className="screen-digits">
            <BraunDigits value={displayValue} />
            <p className="screen-sublabel">{sublabel}</p>
            {deltaView && (
              <p className={`screen-delta${deltaView.flat ? " screen-delta-flat" : ""}`}>
                {!deltaView.flat && (
                  <span className="screen-delta-caret" aria-hidden="true">▲</span>
                )}
                <span className="screen-delta-value">{deltaView.primary}</span>
                <span className="screen-delta-sep" aria-hidden="true">·</span>
                <span className="screen-delta-window">{deltaView.secondary}</span>
              </p>
            )}
            <ShareButton text={shareText} url={shareUrl} />
          </div>

          {protocols.length > 0 && (
            <div className="breakdown">
              <div className="breakdown-heading">
                <span
                  className={`live-dot ${isLive ? "live-dot-on" : "live-dot-off"}`}
                  aria-hidden="true"
                />
                <span>Live aggregate</span>
                <span className="breakdown-heading-sep" aria-hidden="true">·</span>
                <span>updated every minute</span>
              </div>
              <div className="screen-breakdown" role="group" aria-label="Per-protocol share of all-time shielded ETH">
                {protocols.map((p) => (
                  <BreakdownSegment
                    key={p.id}
                    protocol={p}
                    isActive={hoveredId === p.id}
                    onActivate={handleSegmentActivate}
                    onDeactivate={handleSegmentDeactivate}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="screen-chart">
            <RangeToggle
              ranges={ranges.map((r) => ({ key: r.key, label: r.label }))}
              active={activeRange}
              onChange={setActiveRange}
            />
            <InflowChart
              points={view.points}
              mode={view.mode}
              order={order}
              hoveredId={hoveredId}
              onHover={setHoveredId}
            />
          </div>
        </div>
      </div>

      <div className="below-fold">
        {children}
        <footer className="site-footer">
          <span>built for people who prefer privacy &amp; silence</span>
        </footer>
      </div>
    </section>
  );
}
