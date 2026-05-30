"use client";

import { memo, useMemo, useRef, useState, type PointerEvent } from "react";
import type { ChartPoint } from "@/lib/daily";

type Props = {
  points: ChartPoint[];
  mode: "bars" | "area";
  order: { id: string; color: string }[];
  /** Shared protocol hover (breakdown segment / area band). */
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  /** Hovered day (bars mode) — surfaced in the headline, not in the chart. */
  onDayHover: (day: { label: string; total: number } | null) => void;
};

const H = 60; // viewBox height units
// Mirror the breakdown bar's quiet ink-wash; color only on hover.
const GREY = "rgba(10, 13, 18, 0.16)";
const GREY_ALT = "rgba(10, 13, 18, 0.10)";

function InflowChart({ points, mode, order, hoveredId, onHover, onDayHover }: Props) {
  const [dayHover, setDayHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const max = useMemo(() => Math.max(1e-9, ...points.map((p) => p.total)), [points]);
  const greyOf = useMemo(() => {
    const idx = new Map(order.map((o, i) => [o.id, i]));
    return (id: string) => ((idx.get(id) ?? 0) % 2 ? GREY_ALT : GREY);
  }, [order]);

  if (points.length === 0) {
    return <div className="inflow-chart inflow-chart-empty" aria-hidden="true" />;
  }

  const n = points.length;
  const colW = 100 / n;
  const y = (eth: number) => H - (eth / max) * H;

  // Full-width hit-testing: map cursor x to the nearest column (covers gaps).
  const handleMove = (e: PointerEvent<HTMLDivElement>) => {
    if (mode !== "bars") return;
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    const i = Math.min(n - 1, Math.max(0, Math.floor(frac * n)));
    setDayHover(i);
    onDayHover({ label: points[i].label, total: points[i].total });
  };
  const handleLeave = () => {
    setDayHover(null);
    onDayHover(null);
    if (mode === "area") onHover(null);
  };

  return (
    <div
      className="inflow-chart"
      ref={wrapRef}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
    >
      <svg
        className="inflow-chart-svg"
        viewBox={`0 0 100 ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Shielded inflow over time"
      >
        {mode === "bars"
          ? points.map((p, i) => {
              let acc = 0;
              const x = i * colW;
              return (
                <g key={i}>
                  {p.values.map((v) => {
                    const h = (v.eth / max) * H;
                    const yy = H - acc - h;
                    acc += h;
                    const colored = dayHover === i || hoveredId === v.id;
                    return (
                      <rect
                        key={v.id}
                        className="inflow-bar"
                        x={x + colW * 0.1}
                        y={yy}
                        width={colW * 0.8}
                        height={Math.max(0, h)}
                        fill={colored ? v.color : greyOf(v.id)}
                      />
                    );
                  })}
                </g>
              );
            })
          : order.map((o) => {
              const top: string[] = [];
              const bottom: string[] = [];
              points.forEach((p, i) => {
                const x = (i / (n - 1 || 1)) * 100;
                const idx = p.values.findIndex((v) => v.id === o.id);
                const below = p.values.slice(0, idx).reduce((s, v) => s + v.eth, 0);
                const here = p.values[idx]?.eth ?? 0;
                top.push(`${x},${y(below + here)}`);
                bottom.push(`${x},${y(below)}`);
              });
              const active = hoveredId === o.id;
              return (
                <polygon
                  key={o.id}
                  className="inflow-area"
                  points={[...top, ...bottom.reverse()].join(" ")}
                  fill={active ? o.color : greyOf(o.id)}
                  onPointerEnter={() => onHover(o.id)}
                />
              );
            })}
      </svg>
    </div>
  );
}

export default memo(InflowChart);
