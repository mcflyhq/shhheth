"use client";

import { memo, useMemo, useRef, useState, type PointerEvent } from "react";
import type { ChartPoint } from "@/lib/daily";

type Props = {
  points: ChartPoint[];
  order: { id: string; color: string }[];
  /** Shared protocol hover (breakdown segment) — colours that band across columns. */
  hoveredId: string | null;
  /** Hovered column — surfaced in the headline value slot, not in the chart. */
  onDayHover: (day: { label: string; total: number } | null) => void;
};

/**
 * Contiguous, full-bleed stacked bars (HTML, not SVG) so hovered segments can
 * carry the exact dot texture of the breakdown bar. Windowed ranges show daily
 * inflow; "all" shows weekly cumulative (which reads as a rising filled area).
 */
function InflowChart({ points, order, hoveredId, onDayHover }: Props) {
  const [dayHover, setDayHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const max = useMemo(() => Math.max(1e-9, ...points.map((p) => p.total)), [points]);
  const altOf = useMemo(() => {
    const idx = new Map(order.map((o, i) => [o.id, i]));
    return (id: string) => ((idx.get(id) ?? 0) % 2 === 1);
  }, [order]);

  if (points.length === 0) {
    return <div className="inflow-chart inflow-chart-empty" aria-hidden="true" />;
  }

  const n = points.length;

  const handleMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const i = Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - rect.left) / rect.width) * n)));
    setDayHover(i);
    onDayHover({ label: points[i].label, total: points[i].total });
  };
  const handleLeave = () => {
    setDayHover(null);
    onDayHover(null);
  };

  return (
    <div
      className="inflow-chart"
      ref={wrapRef}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
    >
      {points.map((p, i) => (
        <div className="inflow-col" key={i}>
          {p.values.map((v) => {
            const colored = dayHover === i || hoveredId === v.id;
            return (
              <div
                key={v.id}
                className={`inflow-seg${altOf(v.id) ? " is-alt" : ""}${colored ? " is-on" : ""}`}
                style={{
                  height: `${(v.eth / max) * 100}%`,
                  ["--seg-color" as string]: v.color,
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default memo(InflowChart);
