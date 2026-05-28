/**
 * Per-protocol subgraph configuration.
 *
 * Adding a new protocol is one entry here + one adapter. Each protocol gets
 * its own immutable subgraph deployment, so adding never re-indexes the others.
 *
 * Live protocols MUST provide endpoint + query + adapt.
 * Soon protocols omit them and render as scaffolded rows.
 */

export type ProtocolStatus = "live" | "sunset" | "soon";

export type ProtocolResult = {
  id: string;
  name: string;
  status: Exclude<ProtocolStatus, "soon">;
  totalETH: bigint;
  lastUpdatedBlock: bigint;
};

type Adapter = (raw: unknown) => Pick<ProtocolResult, "totalETH" | "lastUpdatedBlock"> | null;

export type ProtocolConfig = {
  id: string;
  name: string;
  status: ProtocolStatus;
  /** Accent hex used by the breakdown segment + any per-protocol UI. */
  color: string;
  endpoint?: string;
  query?: string;
  adapt?: Adapter;
};

const aztecAdapter: Adapter = (raw) => {
  const data = raw as { global: { totalShieldedETH: string; lastUpdatedBlock: string } | null };
  if (!data.global) return null;
  return {
    totalETH: BigInt(data.global.totalShieldedETH),
    lastUpdatedBlock: BigInt(data.global.lastUpdatedBlock),
  };
};

const tornadoAdapter: Adapter = (raw) => {
  const data = raw as {
    tornadoGlobal: { totalShieldedETH: string; lastUpdatedBlock: string } | null;
  };
  if (!data.tornadoGlobal) return null;
  return {
    totalETH: BigInt(data.tornadoGlobal.totalShieldedETH),
    lastUpdatedBlock: BigInt(data.tornadoGlobal.lastUpdatedBlock),
  };
};

const railgunAdapter: Adapter = (raw) => {
  const data = raw as {
    railgunGlobal: { totalShieldedETH: string; lastUpdatedBlock: string } | null;
  };
  if (!data.railgunGlobal) return null;
  return {
    totalETH: BigInt(data.railgunGlobal.totalShieldedETH),
    lastUpdatedBlock: BigInt(data.railgunGlobal.lastUpdatedBlock),
  };
};

const GOLDSKY_BASE =
  "https://api.goldsky.com/api/public/project_cmkci36i9nujr01tz05uk6gfc/subgraphs";

export const PROTOCOLS: ProtocolConfig[] = [
  {
    id: "aztec",
    name: "Aztec Connect",
    status: "sunset",
    color: "#3b5bff",
    endpoint: `${GOLDSKY_BASE}/shhhethgrok/0.1.0/gn`,
    query: `{ global(id: "1") { totalShieldedETH lastUpdatedBlock } }`,
    adapt: aztecAdapter,
  },
  {
    id: "tornado",
    name: "Tornado Cash",
    status: "live",
    color: "#36c5b0",
    endpoint: `${GOLDSKY_BASE}/shhhethgrok-tornado/0.1.0/gn`,
    query: `{ tornadoGlobal(id: "1") { totalShieldedETH lastUpdatedBlock } }`,
    adapt: tornadoAdapter,
  },
  {
    id: "railgun",
    name: "Railgun",
    status: "live",
    color: "#ff8a5b",
    endpoint: `${GOLDSKY_BASE}/shhheth-railgun/2.0.0/gn`,
    query: `{ railgunGlobal(id: "1") { totalShieldedETH lastUpdatedBlock } }`,
    adapt: railgunAdapter,
  },
  { id: "privacy-pools", name: "Privacy Pools", status: "soon", color: "#9b6cff" },
  { id: "hinkal", name: "Hinkal", status: "soon", color: "#f0b441" },
];
