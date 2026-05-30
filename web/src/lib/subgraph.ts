import { cache } from "react";
import { request } from "graphql-request";

import {
  PROTOCOLS,
  type ProtocolConfig,
  type ProtocolResult,
} from "./protocols";
import { getDailySeries, windowSum } from "./daily";

/** Rolling window for the "shielded this week" delta. */
export const WINDOW_DAYS = 7;

export type Snapshot = {
  totalETH: bigint;
  /** Aggregate inflow over the window. `null` when no baseline resolved at all. */
  deltaETH: bigint | null;
  windowDays: number;
  protocols: ProtocolResult[];
  scaffold: ProtocolConfig[];
};

export type DisplayProtocol = {
  id: string;
  name: string;
  color: string;
  /** wei as a decimal string — for formatting at any precision client-side */
  totalWei: string;
  /** pre-formatted for the hero swap (3-decimal default) */
  formattedETH: string;
  /** 0–100, computed against the global total */
  percentage: number;
};

/** This protocol's share (0–100) of the window's total inflow. */
export function weekShare(protocolDelta: bigint, aggregateDelta: bigint): number | null {
  if (aggregateDelta <= 0n) return null;
  return Number((protocolDelta * 10000n) / aggregateDelta) / 100;
}

export function getDisplayProtocols(snapshot: Snapshot, decimals = 3): DisplayProtocol[] {
  if (snapshot.totalETH === 0n) return [];
  const byId = new Map(snapshot.scaffold.map((s) => [s.id, s]));
  return snapshot.protocols
    .map((p) => {
      const fraction = Number((p.totalETH * 10000n) / snapshot.totalETH) / 100;
      const config = byId.get(p.id);
      return {
        id: p.id,
        name: p.name,
        color: config?.color ?? "#3b5bff",
        totalWei: p.totalETH.toString(),
        formattedETH: formatETH(p.totalETH, decimals),
        percentage: fraction,
      };
    })
    .sort((a, b) => b.percentage - a.percentage);
}

type GlobalRow = { totalShieldedETH: string; lastUpdatedBlock?: string } | null;

async function fetchTotal(config: ProtocolConfig): Promise<ProtocolResult | null> {
  if (!config.endpoint || !config.entity || config.status === "soon") return null;
  try {
    const raw = (await request(
      config.endpoint,
      `{ g: ${config.entity}(id: "${config.entityId ?? "1"}") { totalShieldedETH lastUpdatedBlock } }`,
    )) as { g: GlobalRow };
    if (!raw.g) return null;
    return {
      id: config.id,
      name: config.name,
      status: config.status as Exclude<ProtocolResult["status"], "soon">,
      totalETH: BigInt(raw.g.totalShieldedETH),
      deltaETH: null, // per-protocol window deltas are derived in page.tsx from the series
      lastUpdatedBlock: BigInt(raw.g.lastUpdatedBlock ?? "0"),
    };
  } catch (error) {
    console.error(`[shhheth] ${config.id} total query failed:`, error);
    return null;
  }
}

export const getTotals = cache(async (): Promise<Snapshot> => {
  const [settled, series] = await Promise.all([
    Promise.allSettled(PROTOCOLS.map(fetchTotal)),
    getDailySeries(),
  ]);
  const protocols = settled
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter((v): v is ProtocolResult => v !== null);
  const totalETH = protocols.reduce((s, p) => s + p.totalETH, 0n);
  const deltaETH = series.days.length > 0 ? windowSum(series, WINDOW_DAYS).total : null;
  return { totalETH, deltaETH, windowDays: WINDOW_DAYS, protocols, scaffold: PROTOCOLS };
});

const WEI_PER_ETH = 10n ** 18n;

export function formatETH(wei: bigint, decimals = 3): string {
  const negative = wei < 0n;
  const abs = negative ? -wei : wei;
  const whole = abs / WEI_PER_ETH;
  const remainder = abs % WEI_PER_ETH;
  const fractional = remainder.toString().padStart(18, "0").slice(0, decimals);
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = decimals > 0 ? `${wholeStr}.${fractional}` : wholeStr;
  return negative ? `-${body}` : body;
}

/** Signed ETH for deltas: "+73.2", "-1.0", or "0" when exactly zero. */
export function formatSignedETH(wei: bigint, decimals = 1): string {
  if (wei === 0n) return "0";
  const body = formatETH(wei < 0n ? -wei : wei, decimals);
  return wei > 0n ? `+${body}` : `-${body}`;
}
