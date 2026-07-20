/**
 * flow.shhheth — types + helpers for the Tornado pool flow view.
 *
 * Data is per-event (deposits / withdrawals). There is intentionally no
 * deposit→withdrawal link — that is the privacy property we visualize.
 */

export type FlowPool = "0.1" | "1" | "10" | "100";

export type FlowWindow = "24h" | "7d";

export const FLOW_WINDOWS: { key: FlowWindow; label: string; seconds: number }[] = [
  { key: "24h", label: "24h", seconds: 24 * 60 * 60 },
  { key: "7d", label: "7d", seconds: 7 * 24 * 60 * 60 },
];

/** Pool meta: size encodes denom. Input *color* is per-address (see addressColor). */
export const POOL_META: Record<
  FlowPool,
  { label: string; color: string; amountEth: number; wei: bigint; particlePx: number }
> = {
  "0.1": {
    label: "0.1 ETH",
    color: "#7ec8b8",
    amountEth: 0.1,
    wei: 10n ** 17n,
    particlePx: 3.5,
  },
  "1": {
    label: "1 ETH",
    color: "#36c5b0",
    amountEth: 1,
    wei: 10n ** 18n,
    particlePx: 5.5,
  },
  "10": {
    label: "10 ETH",
    color: "#1a9a8a",
    amountEth: 10,
    wei: 10n ** 19n,
    particlePx: 8.5,
  },
  "100": {
    label: "100 ETH",
    color: "#0d6b62",
    amountEth: 100,
    wei: 10n ** 20n,
    particlePx: 12,
  },
};

export const POOL_ORDER: FlowPool[] = ["0.1", "1", "10", "100"];

export type FlowDeposit = {
  id: string;
  pool: FlowPool;
  amountWei: bigint;
  from: string;
  timestamp: number;
  blockNumber: number;
  txHash: string;
};

export type FlowWithdrawal = {
  id: string;
  pool: FlowPool;
  amountWei: bigint;
  to: string;
  relayer: string;
  feeWei: bigint;
  timestamp: number;
  blockNumber: number;
  txHash: string;
};

export type FlowSnapshot = {
  window: FlowWindow;
  since: number;
  deposits: FlowDeposit[];
  withdrawals: FlowWithdrawal[];
  /** Sum of deposit amounts in the fetched set (wei). */
  inWei: bigint;
  /** Sum of withdrawal amounts in the fetched set (wei). */
  outWei: bigint;
  /** Sum of relayer fees on withdrawals in the window (wei). */
  feeWei: bigint;
  /** True counts in the window (full window; not a sample). */
  depositCount: number;
  withdrawalCount: number;
  /**
   * Reserved for partial loads (e.g. subgraph errors). Fetch no longer applies
   * an artificial event ceiling — 24h and 7d should be complete.
   */
  truncated: boolean;
  /** True when the event subgraph is still catching up to head. */
  indexing: boolean;
  /** Subgraph head block, if reported. */
  indexedBlock: number | null;
};

export function shortAddr(hex: string, head = 4, tail = 3): string {
  if (!hex || typeof hex !== "string") return "0x…";
  const raw = hex.trim();
  if (!raw) return "0x…";
  const h = raw.startsWith("0x") || raw.startsWith("0X") ? raw : `0x${raw}`;
  if (h.length < 2 + head + tail) return h;
  return `${h.slice(0, 2 + head)}…${h.slice(-tail)}`;
}

export function shortTx(hex: string): string {
  return shortAddr(hex, 4, 4);
}

export function formatEthWei(wei: bigint, decimals = 1): string {
  try {
    const d = Math.max(0, Math.min(18, Math.floor(decimals)));
    const neg = wei < 0n;
    const abs = neg ? -wei : wei;
    const whole = abs / 10n ** 18n;
    const frac = abs % 10n ** 18n;
    const fracStr = frac.toString().padStart(18, "0").slice(0, d);
    // Match quiet-index formatETH: thousands separators on the whole part
    const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const body = d > 0 ? `${wholeStr}.${fracStr}` : wholeStr;
    return neg ? `-${body}` : body;
  } catch {
    return "0";
  }
}

export function isFlowPool(s: string): s is FlowPool {
  return s === "0.1" || s === "1" || s === "10" || s === "100";
}

/** Initial rows per side (newest first). User can load more. */
export const FLOW_LIST_PAGE = 60;

/**
 * Soft UI default for flow list DOM (virtualization later).
 * Grid uses the full fetched series for pack + can load the full list.
 */
export const FLOW_LIST_MAX = 400;

/**
 * GraphQL page size (Goldsky / The Graph typically allow `first` ≤ 1000).
 * We page until the window is exhausted — no artificial event ceiling.
 */
export const FLOW_PAGE_SIZE = 1000;

/** Relayer-fee strip on the pool bar (coinjoin.nl orange family). */
export const FEE_COLOR = "#e07a3a";
export const FEE_COLOR_SOFT = "rgba(224, 122, 58, 0.92)";

function hashU32(seed: string): number {
  let h = 2166136261;
  const s = seed.toLowerCase();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Coinjoin-style input colors: stable per address, vivid multi-hue, high sat.
 * Golden-angle spacing on the hue wheel (like Wasabi/coinjoin explorers).
 */
export function addressColor(address: string, opts?: { muted?: boolean }): string {
  const u = hashU32(address);
  const hue = (u * 137.508) % 360;
  if (opts?.muted) {
    return `hsl(${hue.toFixed(1)} 62% 48%)`;
  }
  return `hsl(${hue.toFixed(1)} 78% 52%)`;
}

export function addressColorMuted(address: string): string {
  return addressColor(address, { muted: true });
}

/**
 * Paper–teal hue-locked band for flow cubes (shhheth quiet ink).
 * Hue 165–205° (centered ~185°, next to POOL_META teals).
 * - flight: S62 L50 — vivid band (from cube-hue-band examples)
 * - landed: S48 L42 — slightly quieter mosaic after slot
 * Outputs stay neutral grey (not this helper).
 */
export function addressColorPaperTeal(
  address: string,
  tone: "flight" | "landed" = "flight",
): string {
  const u = hashU32(address);
  const hue = 165 + (u % 41); // 165..205 inclusive
  if (tone === "landed") {
    return `hsl(${hue} 48% 42%)`;
  }
  return `hsl(${hue} 62% 50%)`;
}

/**
 * Pool filter chips in the same paper–teal family (denom ladder, not rainbow).
 * Distinct steps so 0.1 / 1 / 10 / 100 still read; all sit in 165–205°.
 */
export const POOL_CHIP_COLORS: Record<FlowPool, string> = {
  "0.1": "hsl(200 40% 56%)",
  "1": "hsl(188 46% 50%)",
  "10": "hsl(176 48% 44%)",
  "100": "hsl(166 50% 38%)",
};

/**
 * Withdrawal row hover fill — cool paper/grey (not pool green).
 * Mid lightness so white label text keeps contrast on the dark stage.
 */
export const OUT_ROW_HOVER = "hsl(210 12% 44%)";

export function formatCount(n: number, truncated: boolean): string {
  const safe = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  if (safe >= 1000) {
    const k = safe / 1000;
    const body = k >= 10 ? `${Math.round(k)}k` : `${k.toFixed(1).replace(/\.0$/, "")}k`;
    return truncated ? `${body}+` : body;
  }
  return truncated ? `${safe}+` : String(safe);
}

/** Parse wei-like strings without throwing (bad subgraph payloads). */
export function safeBigInt(value: string | number | bigint | null | undefined, fallback = 0n): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    try {
      return BigInt(Math.trunc(value));
    } catch {
      return fallback;
    }
  }
  if (typeof value === "string" && value.trim() !== "") {
    try {
      return BigInt(value.trim());
    } catch {
      return fallback;
    }
  }
  return fallback;
}
