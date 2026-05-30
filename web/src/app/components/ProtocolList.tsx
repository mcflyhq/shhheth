"use client";

import { useMemo } from "react";

import type { ProtocolStatus } from "@/lib/protocols";
import { formatETH, type DisplayProtocol } from "@/lib/subgraph";
import Sparkline from "./Sparkline";
import { useSpotlight } from "./useSpotlight";

/** Server-safe subset of ProtocolConfig — strips the adapter function so the
 *  data can cross the server/client boundary. */
export type ProtocolListItem = {
  id: string;
  name: string;
  status: ProtocolStatus;
  color: string;
};

type Props = {
  scaffold: ProtocolListItem[];
  live: DisplayProtocol[];
  sparklines: Record<string, number[]>;
};

export default function ProtocolList({ scaffold, live, sparklines }: Props) {
  const liveById = useMemo(
    () => new Map(live.map((p) => [p.id, p])),
    [live],
  );

  const sorted = useMemo(() => {
    const pctById = new Map(live.map((p) => [p.id, p.percentage]));
    return scaffold
      .slice()
      .sort((a, b) => (pctById.get(b.id) ?? -1) - (pctById.get(a.id) ?? -1));
  }, [scaffold, live]);

  const { ref, onPointerMove } = useSpotlight<HTMLUListElement>();

  return (
    <section className="protocols" aria-label="Breakdown by protocol">
      <h2 className="section-heading">
        <span>By protocol</span>
        <span className="section-heading-sep" aria-hidden="true">·</span>
        <span>Ethereum mainnet</span>
      </h2>
      <ul ref={ref} onPointerMove={onPointerMove} className="protocol-grid">
        {sorted.map((row) => {
          const data = liveById.get(row.id);
          const amount = data ? formatETH(BigInt(data.totalWei), 1) : null;
          const pct = data ? `${data.percentage.toFixed(1)}%` : null;
          const statusText = row.status === "soon" ? "indexing soon" : row.status;
          return (
            <li
              key={row.id}
              data-spotlight
              className={`protocol-card protocol-card-${row.status}`}
              style={{ ["--seg-color" as string]: row.color }}
            >
              <span className="spotlight-glow" aria-hidden="true" />
              <span className="spotlight-pattern" aria-hidden="true" />
              <div className="protocol-card-head">
                <span className="protocol-card-name">{row.name}</span>
                {data ? (
                  <span className="protocol-card-pct">{pct}</span>
                ) : (
                  <span className="protocol-card-pct protocol-card-pct-quiet">{statusText}</span>
                )}
              </div>
              <div className="protocol-card-data">
                {data ? (
                  <>
                    <span className="protocol-card-amount">{amount}</span>
                    <span className="protocol-card-amount-label">ETH shielded · cumulative</span>
                    <figure className="protocol-card-spark">
                      <Sparkline values={sparklines[row.id] ?? []} color={row.color} />
                      <figcaption className="protocol-card-spark-label">daily inflow · last 30d</figcaption>
                    </figure>
                  </>
                ) : (
                  <>
                    <span className="protocol-card-amount protocol-card-amount-quiet">—</span>
                    <span className="protocol-card-amount-label">catching up</span>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
