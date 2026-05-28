import type { ProtocolSnapshot } from "@/lib/subgraph";
import { formatETH } from "@/lib/subgraph";

type Props = {
  protocols: ProtocolSnapshot[] | null;
};

type Row = {
  id: string;
  name: string;
  status: "live" | "sunset" | "soon";
};

const SCAFFOLD: Row[] = [
  { id: "aztec", name: "Aztec Connect", status: "sunset" },
  { id: "privacy-pools", name: "Privacy Pools", status: "live" },
  { id: "tornado", name: "Tornado Cash", status: "live" },
  { id: "railgun", name: "Railgun", status: "soon" },
  { id: "hinkal", name: "Hinkal", status: "soon" },
];

export default function ProtocolList({ protocols }: Props) {
  const byId = new Map((protocols ?? []).map((p) => [p.id, p]));

  return (
    <section className="protocol-list" aria-label="Protocols">
      <h2 className="protocol-list-heading">By protocol</h2>
      <ul>
        {SCAFFOLD.map((row) => {
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
        shhheth counts every ETH deposit into supported privacy protocols.
        Withdrawals do not reduce the count — this is a lifetime total, not
        current TVL.
      </p>
    </section>
  );
}
