import type { ProtocolConfig, ProtocolResult } from "@/lib/protocols";
import { formatETH } from "@/lib/subgraph";

type Props = {
  scaffold: ProtocolConfig[];
  live: ProtocolResult[];
};

export default function ProtocolList({ scaffold, live }: Props) {
  const byId = new Map(live.map((p) => [p.id, p]));

  return (
    <section className="protocol-list" aria-label="Protocols">
      <h2 className="protocol-list-heading">tracked across</h2>
      <ul>
        {scaffold.map((row) => {
          const snap = byId.get(row.id);
          const eth = snap ? formatETH(snap.totalETH, 1) : null;
          return (
            <li key={row.id} className={`protocol-row protocol-row-${row.status}`}>
              <span className="protocol-name">{row.name}</span>
              <span className="protocol-value">
                {eth ? `${eth} ETH` : row.status === "soon" ? "soon" : "—"}
              </span>
              <span className="protocol-status">{row.status}</span>
            </li>
          );
        })}
      </ul>
      <p className="methodology">
        <span className="methodology-strong">ETH only.</span> Native ETH and
        WETH (counted as ETH). Nothing else — no USDC, no USDT, no DAI, no
        wrapped tokens, no anything-else that may also be shielded in these
        protocols. Every ETH deposit counts; withdrawals don&apos;t subtract.
        Lifetime total, not TVL. We see the proof. We don&apos;t tell.
      </p>
    </section>
  );
}
