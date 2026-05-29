import { cache } from "react";
import { request } from "graphql-request";

import {
  PROTOCOLS,
  type ProtocolConfig,
  type ProtocolResult,
} from "./protocols";

/** Rolling window for the "shielded this week" delta. */
export const WINDOW_DAYS = 7;
/** ~7 days at 12s/block. Drift is a few minutes — irrelevant for a weekly stat. */
const BLOCKS_PER_WINDOW = 50_400n;

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
  /** window inflow as wei string, or null when the baseline failed to resolve */
  deltaWei: string | null;
  /** pre-formatted signed inflow, e.g. "+73.2", or null when unknown */
  formattedDelta: string | null;
  /** this protocol's share of the window's total inflow (0–100), or null */
  weekSharePct: number | null;
};

/** Window inflow for one monotonic counter. `prior` null ⇒ baseline unknown. */
export function computeDelta(current: bigint, prior: bigint | null): bigint | null {
  if (prior === null) return null;
  const delta = current - prior;
  return delta > 0n ? delta : 0n;
}

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
      const sharePct =
        p.deltaETH !== null && snapshot.deltaETH !== null
          ? weekShare(p.deltaETH, snapshot.deltaETH)
          : null;
      return {
        id: p.id,
        name: p.name,
        color: config?.color ?? "#3b5bff",
        totalWei: p.totalETH.toString(),
        formattedETH: formatETH(p.totalETH, decimals),
        percentage: fraction,
        deltaWei: p.deltaETH !== null ? p.deltaETH.toString() : null,
        formattedDelta: p.deltaETH !== null ? formatSignedETH(p.deltaETH, 1) : null,
        weekSharePct: sharePct,
      };
    })
    .sort((a, b) => b.percentage - a.percentage);
}

type Current = {
  config: ProtocolConfig;
  head: bigint;
  total: bigint;
  lastUpdatedBlock: bigint;
};

type GlobalRow = { totalShieldedETH: string; lastUpdatedBlock?: string } | null;

function currentQuery(entity: string, id: string): string {
  return `{ _meta { block { number } } current: ${entity}(id: "${id}") { totalShieldedETH lastUpdatedBlock } }`;
}

function priorQuery(entity: string, id: string, block: bigint): string {
  return `{ prior: ${entity}(id: "${id}", block: { number: ${block} }) { totalShieldedETH } }`;
}

async function fetchCurrent(config: ProtocolConfig): Promise<Current | null> {
  if (!config.endpoint || !config.entity || config.status === "soon") {
    return null;
  }
  try {
    const raw = (await request(
      config.endpoint,
      currentQuery(config.entity, config.entityId ?? "1"),
    )) as { _meta: { block: { number: number } } | null; current: GlobalRow };
    if (!raw.current || !raw._meta) return null;
    return {
      config,
      head: BigInt(raw._meta.block.number),
      total: BigInt(raw.current.totalShieldedETH),
      lastUpdatedBlock: BigInt(raw.current.lastUpdatedBlock ?? "0"),
    };
  } catch (error) {
    console.error(`[shhheth] ${config.id} current query failed:`, error);
    return null;
  }
}

/**
 * Historical total at `block`. Returns 0 when the counter did not yet exist at
 * that point (subgraph older than the window — the whole current total is this
 * week's inflow), and null only when the query genuinely failed.
 */
async function fetchPrior(config: ProtocolConfig, block: bigint): Promise<bigint | null> {
  try {
    const raw = (await request(
      config.endpoint!,
      priorQuery(config.entity!, config.entityId ?? "1", block),
    )) as { prior: GlobalRow };
    return raw.prior ? BigInt(raw.prior.totalShieldedETH) : 0n;
  } catch (error) {
    if (JSON.stringify(error).includes("only has data starting at block")) {
      return 0n;
    }
    console.error(`[shhheth] ${config.id} prior query failed:`, error);
    return null;
  }
}

/**
 * Per-request memoized aggregation across every live protocol, plus a rolling
 * 7-day inflow delta. Phase 1 fetches each protocol's current total + the chain
 * head from its own `_meta`; phase 2 fetches each protocol's total at
 * `head − 7d` via a Graph time-travel query. No extra storage — the subgraph's
 * own historical state is the baseline. `cache()` collapses duplicate reads in
 * one render; the page's `revalidate = 60` ISR window sits above it.
 */
export const getTotals = cache(async (): Promise<Snapshot> => {
  const settled = await Promise.allSettled(PROTOCOLS.map(fetchCurrent));
  const current = settled
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter((v): v is Current => v !== null);

  if (current.length === 0) {
    return { totalETH: 0n, deltaETH: null, windowDays: WINDOW_DAYS, protocols: [], scaffold: PROTOCOLS };
  }

  const head = current.reduce((max, c) => (c.head > max ? c.head : max), 0n);
  const priorBlock = head > BLOCKS_PER_WINDOW ? head - BLOCKS_PER_WINDOW : 0n;

  const priors = await Promise.allSettled(
    current.map((c) => fetchPrior(c.config, priorBlock)),
  );

  const protocols: ProtocolResult[] = current.map((c, i) => {
    const settledPrior = priors[i];
    const prior = settledPrior.status === "fulfilled" ? settledPrior.value : null;
    return {
      id: c.config.id,
      name: c.config.name,
      status: c.config.status as Exclude<ProtocolResult["status"], "soon">,
      totalETH: c.total,
      deltaETH: computeDelta(c.total, prior),
      lastUpdatedBlock: c.lastUpdatedBlock,
    };
  });

  const totalETH = protocols.reduce((sum, p) => sum + p.totalETH, 0n);
  const knownDeltas = protocols
    .map((p) => p.deltaETH)
    .filter((d): d is bigint => d !== null);
  const deltaETH = knownDeltas.length > 0 ? knownDeltas.reduce((s, d) => s + d, 0n) : null;

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
