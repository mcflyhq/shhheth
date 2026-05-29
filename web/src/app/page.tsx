import Methodology from "./components/Methodology";
import OdometerStage from "./components/OdometerStage";
import ProtocolList, { type ProtocolListItem } from "./components/ProtocolList";
import { formatETH, formatSignedETH, getDisplayProtocols, getTotals } from "@/lib/subgraph";
import { buildShareText } from "@/lib/share";

export const revalidate = 60;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://shhheth.com";

export default async function HomePage() {
  const snapshot = await getTotals();
  const formattedTotal = formatETH(snapshot.totalETH, 3);
  const isLive = snapshot.protocols.length > 0;
  const displayProtocols = getDisplayProtocols(snapshot, 3);

  const weekDelta =
    snapshot.deltaETH !== null
      ? { formatted: formatSignedETH(snapshot.deltaETH, 1), zero: snapshot.deltaETH === 0n }
      : null;

  const topMover = displayProtocols
    .filter((p) => p.weekSharePct !== null)
    .sort((a, b) => (b.weekSharePct ?? 0) - (a.weekSharePct ?? 0))[0];
  const shareText = buildShareText({
    total: formatETH(snapshot.totalETH, 0),
    delta: snapshot.deltaETH !== null ? formatSignedETH(snapshot.deltaETH, 0) : null,
    deltaZero: snapshot.deltaETH === 0n,
    topMover:
      topMover && topMover.weekSharePct !== null
        ? { name: topMover.name, sharePct: topMover.weekSharePct }
        : null,
  });

  const scaffold: ProtocolListItem[] = snapshot.scaffold.map(
    ({ id, name, status, color }) => ({ id, name, status, color }),
  );

  return (
    <main>
      <OdometerStage
        formattedTotal={formattedTotal}
        isLive={isLive}
        protocols={displayProtocols}
        weekDelta={weekDelta}
        windowDays={snapshot.windowDays}
        shareText={shareText}
        shareUrl={SITE_URL}
      >
        <ProtocolList scaffold={scaffold} live={displayProtocols} />
        <Methodology />
      </OdometerStage>
    </main>
  );
}
