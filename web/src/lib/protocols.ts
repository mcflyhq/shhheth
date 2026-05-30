/**
 * Per-protocol subgraph configuration.
 *
 * Adding a new protocol is one entry here. Each protocol gets its own immutable
 * subgraph deployment, so adding never re-indexes the others. Every subgraph
 * exposes the same global-counter shape ({ totalShieldedETH, lastUpdatedBlock }),
 * differing only in the root field name — captured by `entity`.
 *
 * Live/sunset protocols MUST provide endpoint + entity.
 * Soon protocols omit them and render as scaffolded rows.
 */

export type ProtocolStatus = "live" | "sunset" | "soon";

export type ProtocolResult = {
  id: string;
  name: string;
  status: Exclude<ProtocolStatus, "soon">;
  totalETH: bigint;
  /** Shielded inflow over the rolling window. `null` when the historical
   *  baseline could not be resolved (query failed) — distinct from a real 0. */
  deltaETH: bigint | null;
  lastUpdatedBlock: bigint;
};

export type ProtocolConfig = {
  id: string;
  name: string;
  status: ProtocolStatus;
  /** Accent hex used by the breakdown segment + any per-protocol UI. */
  color: string;
  endpoint?: string;
  /** Root query field for this subgraph's global counter, e.g. "bowGlobal". */
  entity?: string;
  /** Global-counter entity id. Defaults to "1". */
  entityId?: string;
  /** Root query field for this subgraph's daily-inflow series, e.g. "bowDailyInflows". */
  dailyField?: string;
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
    entity: "global",
    dailyField: "dailyInflows",
  },
  {
    id: "tornado",
    name: "Tornado Cash",
    status: "live",
    color: "#36c5b0",
    endpoint: `${GOLDSKY_BASE}/shhhethgrok-tornado/0.1.0/gn`,
    entity: "tornadoGlobal",
    dailyField: "tornadoDailyInflows",
  },
  {
    id: "railgun",
    name: "Railgun",
    status: "live",
    color: "#ff8a5b",
    endpoint: `${GOLDSKY_BASE}/shhheth-railgun/2.0.0/gn`,
    entity: "railgunGlobal",
    dailyField: "railgunDailyInflows",
  },
  {
    id: "0xbow",
    name: "0xbow",
    status: "live",
    color: "#9b6cff",
    endpoint: `${GOLDSKY_BASE}/shhheth-0xbow/1.0.0/gn`,
    entity: "bowGlobal",
    dailyField: "bowDailyInflows",
  },
];
