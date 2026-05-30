"use client";

import { memo, useMemo, useState } from "react";
import type { ChartPoint } from "@/lib/daily";

type Props = { points: ChartPoint[]; mode: "bars" | "area"; order: { id: string; color: string }[] };

const H = 60; // viewBox height units

function InflowChart({ points, mode, order }: Props) {
  const [hover, setHover] = useState<number | null>(null);

  const max = useMemo(
    () => Math.max(1e-9, ...points.map((p) => p.total)),
    [points],
  );

  if (points.length === 0) {
    return <div className="inflow-chart inflow-chart-empty" aria-hidden="true" />;
  }

  const n = points.length;
  const colW = 100 / n;
  const y = (eth: number) => H - (eth / max) * H;

  return (
    <div className="inflow-chart">
      <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" role="img" aria-label="Shielded inflow over time">
        {mode === "bars"
          ? points.map((p, i) => {
              const x = i * colW;
              let acc = 0;
              return (
                <g key={i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
                  <rect x={x} y={0} width={colW} height={H} fill="transparent" />
                  {p.values.map((v) => {
                    const h = (v.eth / max) * H;
                    const yy = H - acc - h;
                    acc += h;
                    return (
                      <rect
                        key={v.id}
                        x={x + colW * 0.12}
                        y={yy}
                        width={colW * 0.76}
                        height={Math.max(0, h)}
                        fill={v.color}
                        opacity={hover === null || hover === i ? 1 : 0.45}
                      />
                    );
                  })}
                </g>
              );
            })
          : order.map((o) => {
              // stacked area: baseline accumulates across protocols
              const top: string[] = [];
              const bottom: string[] = [];
              points.forEach((p, i) => {
                const x = (i / (n - 1 || 1)) * 100;
                const below = p.values
                  .slice(0, p.values.findIndex((v) => v.id === o.id))
                  .reduce((s, v) => s + v.eth, 0);
                const here = p.values.find((v) => v.id === o.id)?.eth ?? 0;
                top.push(`${x},${y(below + here)}`);
                bottom.push(`${x},${y(below)}`);
              });
              return (
                <polygon
                  key={o.id}
                  points={[...top, ...bottom.reverse()].join(" ")}
                  fill={o.color}
                  opacity={0.9}
                />
              );
            })}
      </svg>
      <p className="inflow-chart-caption" aria-live="polite">
        {hover !== null ? `${points[hover].label} · ${points[hover].total.toFixed(1)} ETH` : " "}
      </p>
    </div>
  );
}

export default memo(InflowChart);
