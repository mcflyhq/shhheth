import Methodology from "./components/Methodology";
import OdometerStage from "./components/OdometerStage";
import ProtocolList, { type ProtocolListItem } from "./components/ProtocolList";
import { formatETH, formatSignedETH, getDisplayProtocols, getTotals } from "@/lib/subgraph";
import { buildShareText } from "@/lib/share";
import {
  RANGES,
  cumulative,
  getDailySeries,
  lastN,
  toChartPoints,
  weeklyBuckets,
  windowSum,
  type ChartPoint,
  type RangeKey,
} from "@/lib/daily";

export const revalidate = 60;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://shhheth.com";

export type RangeView = {
  key: RangeKey;
  label: string;
  mode: "bars" | "area";
  points: ChartPoint[];
  delta: { formatted: string; zero: boolean };
  byProtocol: Record<string, { formatted: string; zero: boolean; sharePct: number | null }>;
};

export default async function HomePage() {
  const [snapshot, series] = await Promise.all([getTotals(), getDailySeries()]);
  const formattedTotal = formatETH(snapshot.totalETH, 3);
  const isLive = snapshot.protocols.length > 0;
  const displayProtocols = getDisplayProtocols(snapshot, 3);

  const order = snapshot.scaffold
    .filter((s) => displayProtocols.some((d) => d.id === s.id))
    .map((s) => ({ id: s.id, color: s.color }));

  const allCumulative = weeklyBuckets(cumulative(series));

  const rangeViews: RangeView[] = RANGES.map((r) => {
    const isAll = r.key === "all";
    const points = isAll
      ? toChartPoints(allCumulative, order)
      : toChartPoints(lastN(series, r.days), order);
    const sum = isAll
      ? { total: snapshot.totalETH, perProtocol: Object.fromEntries(snapshot.protocols.map((p) => [p.id, p.totalETH])) }
      : windowSum(series, r.days);
    const byProtocol: RangeView["byProtocol"] = {};
    for (const o of order) {
      const w = sum.perProtocol[o.id] ?? 0n;
      byProtocol[o.id] = {
        formatted: formatSignedETH(w, 1),
        zero: w === 0n,
        sharePct: sum.total > 0n ? Number((w * 10000n) / sum.total) / 100 : null,
      };
    }
    return {
      key: r.key,
      label: r.label,
      mode: isAll ? "area" : "bars",
      points,
      delta: { formatted: formatSignedETH(sum.total, isAll ? 0 : 1), zero: sum.total === 0n },
      byProtocol,
    };
  });

  const spark30 = lastN(series, 30);
  const sparklines: Record<string, number[]> = {};
  for (const o of order) {
    sparklines[o.id] = spark30.days.map((d) => Number(d.perProtocol[o.id] ?? 0n) / 1e18);
  }

  const topMover = displayProtocols
    .map((p) => ({ id: p.id, name: p.name }))
    .find((p) => {
      const b = rangeViews[0].byProtocol[p.id];
      return b && (b.sharePct ?? 0) >= 1;
    });
  const week = rangeViews[0];
  const shareText = buildShareText({
    total: formatETH(snapshot.totalETH, 0),
    delta: week.delta.zero ? null : week.delta.formatted,
    deltaZero: week.delta.zero,
    topMover:
      topMover && week.byProtocol[topMover.id]?.sharePct != null
        ? { name: topMover.name, sharePct: week.byProtocol[topMover.id].sharePct! }
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
        ranges={rangeViews}
        shareText={shareText}
        shareUrl={SITE_URL}
      >
        <ProtocolList scaffold={scaffold} live={displayProtocols} sparklines={sparklines} />
        <Methodology />
      </OdometerStage>
    </main>
  );
}
