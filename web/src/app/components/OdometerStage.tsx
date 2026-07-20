"use client";

import {
  useCallback,
  useEffect,
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
import PageMast from "./PageMast";
import type { DisplayProtocol } from "@/lib/subgraph";
import type { RangeView } from "../page";
import type { ChartPoint, RangeKey } from "@/lib/daily";

type DeltaView = { tone: "up" | "flat" | "day"; primary: string };

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
  // 7d is a mobile-only option (hidden on desktop via CSS); default to 30d.
  const [activeRange, setActiveRange] = useState<RangeKey>("30d");
  const [dayPoint, setDayPoint] = useState<ChartPoint | null>(null);
  const view = ranges.find((r) => r.key === activeRange) ?? ranges[0];
  const order = ranges[0].points[0]?.values.map((v) => ({ id: v.id, color: v.color })) ?? [];
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

  // Single value slot under the digits: a hovered chart bar shows that day's
  // date + inflow; otherwise the selected period's delta (aggregate, or the
  // hovered protocol's). The range toggle — not text — carries the period.
  const deltaView: DeltaView = useMemo(() => {
    if (dayPoint) {
      return { tone: "day", primary: `${dayPoint.label} · ${dayPoint.total.toFixed(1)} ETH` };
    }
    const d = hovered ? view.byProtocol[hovered.id] : view.delta;
    if (!d) return { tone: "flat", primary: "flat" };
    return d.zero
      ? { tone: "flat", primary: "flat" }
      : { tone: "up", primary: `${d.formatted} ETH` };
  }, [dayPoint, hovered, view]);

  // Hovering a chart bar morphs the breakdown bar to that day's per-protocol
  // split (same order as all-time, so only the widths animate).
  const breakdownProtocols = useMemo(() => {
    if (!dayPoint) return protocols;
    const ethById = new Map(dayPoint.values.map((v) => [v.id, v.eth]));
    return protocols.map((p) => {
      const eth = ethById.get(p.id) ?? 0;
      return {
        ...p,
        percentage: dayPoint.total > 0 ? (eth / dayPoint.total) * 100 : 0,
        formattedETH: eth.toFixed(1),
      };
    });
  }, [dayPoint, protocols]);

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

      <PageMast view="index" />

      <div className="screen-frame" aria-hidden="true">
        <div className="screen-glow" />
        <div className="screen-surface" />
        <div className="screen-content">
          {protocols.length > 0 && (
            <div className="breakdown">
              <div className="screen-breakdown" role="group" aria-label="Per-protocol share of all-time shielded ETH">
                {breakdownProtocols.map((p) => (
                  <BreakdownSegment
                    key={p.id}
                    protocol={p}
                    isActive={hoveredId === p.id}
                    onActivate={handleSegmentActivate}
                    onDeactivate={handleSegmentDeactivate}
                  />
                ))}
              </div>
              <div className="breakdown-heading">
                <span
                  className={`live-dot ${isLive ? "live-dot-on" : "live-dot-off"}`}
                  aria-hidden="true"
                />
                <span>Live aggregate</span>
                <span className="breakdown-heading-sep" aria-hidden="true">·</span>
                <span>updated every minute</span>
              </div>
            </div>
          )}

          <div className="screen-digits">
            <BraunDigits value={displayValue} />
            <p className="screen-sublabel">{sublabel}</p>
            <p className={`screen-delta screen-delta-${deltaView.tone}`}>
              {deltaView.tone === "up" && (
                <span className="screen-delta-caret" aria-hidden="true">▲</span>
              )}
              <span className="screen-delta-value">{deltaView.primary}</span>
            </p>
            <div className="screen-actions">
              <RangeToggle
                ranges={ranges.map((r) => ({ key: r.key, label: r.label }))}
                active={activeRange}
                onChange={setActiveRange}
              />
              <ShareButton text={shareText} url={shareUrl} />
            </div>
          </div>

          <div className="screen-chart">
            <InflowChart
              points={view.points}
              order={order}
              hoveredId={hoveredId}
              onDayHover={setDayPoint}
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
