import { request } from "graphql-request";

import {
  PROTOCOLS,
  type ProtocolConfig,
  type ProtocolResult,
} from "./protocols";

export type Snapshot = {
  totalETH: bigint;
  protocols: ProtocolResult[];
  scaffold: ProtocolConfig[];
};

export type DisplayProtocol = {
  id: string;
  name: string;
  color: string;
  formattedETH: string;
  percentage: number;
};

export function getDisplayProtocols(snapshot: Snapshot, decimals = 3): DisplayProtocol[] {
  if (snapshot.totalETH === 0n) return [];
  const byId = new Map(snapshot.scaffold.map((s) => [s.id, s]));
  return snapshot.protocols.map((p) => {
    const fraction = Number((p.totalETH * 10000n) / snapshot.totalETH) / 100;
    const config = byId.get(p.id);
    return {
      id: p.id,
      name: p.name,
      color: config?.color ?? "#3b5bff",
      formattedETH: formatETH(p.totalETH, decimals),
      percentage: fraction,
    };
  });
}

async function fetchProtocol(
  config: ProtocolConfig,
): Promise<ProtocolResult | null> {
  if (!config.endpoint || !config.query || !config.adapt) {
    return null;
  }
  if (config.status === "soon") {
    return null;
  }
  try {
    const raw = await request(config.endpoint, config.query);
    const parsed = config.adapt(raw);
    if (!parsed) return null;
    return {
      id: config.id,
      name: config.name,
      status: config.status,
      ...parsed,
    };
  } catch (error) {
    console.error(`[shhheth] ${config.id} query failed:`, error);
    return null;
  }
}

export async function getTotals(): Promise<Snapshot> {
  const results = await Promise.allSettled(PROTOCOLS.map(fetchProtocol));
  const protocols = results
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter((v): v is ProtocolResult => v !== null);
  const totalETH = protocols.reduce((sum, p) => sum + p.totalETH, 0n);
  return { totalETH, protocols, scaffold: PROTOCOLS };
}

const WEI_PER_ETH = 10n ** 18n;

export function formatETH(wei: bigint, decimals = 3): string {
  const whole = wei / WEI_PER_ETH;
  const remainder = wei % WEI_PER_ETH;
  const fractional = remainder.toString().padStart(18, "0").slice(0, decimals);
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decimals > 0 ? `${wholeStr}.${fractional}` : wholeStr;
}
