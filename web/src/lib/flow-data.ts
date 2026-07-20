import { cache } from "react";
import { request } from "graphql-request";
import {
  FLOW_PAGE_SIZE,
  FLOW_WINDOWS,
  isFlowPool,
  safeBigInt,
  type FlowDeposit,
  type FlowSnapshot,
  type FlowWindow,
  type FlowWithdrawal,
} from "./flow";

/**
 * Goldsky event subgraph for Flow — per-deposit / per-withdrawal rows.
 * Endpoint: shhheth-tornado-flow/1.0.0 (recent startBlock, full head).
 */
const TORNADO_FLOW_ENDPOINT =
  process.env.TORNADO_FLOW_SUBGRAPH ??
  "https://api.goldsky.com/api/public/project_cmkci36i9nujr01tz05uk6gfc/subgraphs/shhheth-tornado-flow/1.0.0/gn";

type GqlDeposit = {
  id: string;
  pool: string;
  amount: string;
  from: string;
  timestamp: string;
  blockNumber: string;
  txHash: string;
};

type GqlWithdrawal = {
  id: string;
  pool: string;
  amount: string;
  to: string;
  relayer: string;
  fee: string;
  timestamp: string;
  blockNumber: string;
  txHash: string;
};

function parseDeposit(row: GqlDeposit): FlowDeposit | null {
  if (!isFlowPool(row.pool)) return null;
  try {
    return {
      id: row.id,
      pool: row.pool,
      amountWei: safeBigInt(row.amount),
      from: row.from || "0x",
      timestamp: Number(row.timestamp) || 0,
      blockNumber: Number(row.blockNumber) || 0,
      txHash: row.txHash || "",
    };
  } catch {
    return null;
  }
}

function parseWithdrawal(row: GqlWithdrawal): FlowWithdrawal | null {
  if (!isFlowPool(row.pool)) return null;
  try {
    return {
      id: row.id,
      pool: row.pool,
      amountWei: safeBigInt(row.amount),
      to: row.to || "0x",
      relayer: row.relayer || "0x",
      feeWei: safeBigInt(row.fee),
      timestamp: Number(row.timestamp) || 0,
      blockNumber: Number(row.blockNumber) || 0,
      txHash: row.txHash || "",
    };
  } catch {
    return null;
  }
}

/**
 * Page until the subgraph returns a short page.
 * Uses descending timestamp cursor (`timestamp_lt`) so we never hit The Graph
 * `skip` ceiling — windows can be fully accurate (24h and 7d).
 */
async function fetchAllDeposits(since: number): Promise<{
  rows: FlowDeposit[];
  truncated: boolean;
}> {
  const rows: FlowDeposit[] = [];
  const seen = new Set<string>();
  /** Exclusive upper bound for the next page (desc order). */
  let beforeTs: number | null = null;
  let guard = 0;

  while (guard++ < 10_000) {
    const timeClause =
      beforeTs == null
        ? `timestamp_gte: "${since}"`
        : `timestamp_gte: "${since}", timestamp_lt: "${beforeTs}"`;
    const query = `{
      tornadoDeposits(
        first: ${FLOW_PAGE_SIZE}
        orderBy: timestamp
        orderDirection: desc
        where: { ${timeClause} }
      ) {
        id pool amount from timestamp blockNumber txHash
      }
    }`;
    const raw = (await request(TORNADO_FLOW_ENDPOINT, query)) as {
      tornadoDeposits: GqlDeposit[];
    };
    const page = (raw.tornadoDeposits ?? [])
      .map(parseDeposit)
      .filter((d): d is FlowDeposit => d !== null);

    if (page.length === 0) break;

    let added = 0;
    for (const d of page) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      rows.push(d);
      added += 1;
    }

    // Advance cursor past the oldest timestamp on this page
    const oldest = page[page.length - 1]!.timestamp;
    if (beforeTs != null && oldest >= beforeTs) {
      // No progress (e.g. >pageSize events share one timestamp) — fall back a second
      beforeTs = oldest - 1;
    } else {
      beforeTs = oldest;
    }

    if (page.length < FLOW_PAGE_SIZE) break;
    if (added === 0) break;
  }

  // Chronological for animation seed stability
  rows.reverse();
  return { rows, truncated: false };
}

async function fetchAllWithdrawals(since: number): Promise<{
  rows: FlowWithdrawal[];
  truncated: boolean;
}> {
  const rows: FlowWithdrawal[] = [];
  const seen = new Set<string>();
  let beforeTs: number | null = null;
  let guard = 0;

  while (guard++ < 10_000) {
    const timeClause =
      beforeTs == null
        ? `timestamp_gte: "${since}"`
        : `timestamp_gte: "${since}", timestamp_lt: "${beforeTs}"`;
    const query = `{
      tornadoWithdrawals(
        first: ${FLOW_PAGE_SIZE}
        orderBy: timestamp
        orderDirection: desc
        where: { ${timeClause} }
      ) {
        id pool amount to relayer fee timestamp blockNumber txHash
      }
    }`;
    const raw = (await request(TORNADO_FLOW_ENDPOINT, query)) as {
      tornadoWithdrawals: GqlWithdrawal[];
    };
    const page = (raw.tornadoWithdrawals ?? [])
      .map(parseWithdrawal)
      .filter((w): w is FlowWithdrawal => w !== null);

    if (page.length === 0) break;

    let added = 0;
    for (const w of page) {
      if (seen.has(w.id)) continue;
      seen.add(w.id);
      rows.push(w);
      added += 1;
    }

    const oldest = page[page.length - 1]!.timestamp;
    if (beforeTs != null && oldest >= beforeTs) {
      beforeTs = oldest - 1;
    } else {
      beforeTs = oldest;
    }

    if (page.length < FLOW_PAGE_SIZE) break;
    if (added === 0) break;
  }

  rows.reverse();
  return { rows, truncated: false };
}

async function queryWindow(window: FlowWindow): Promise<FlowSnapshot> {
  const meta = FLOW_WINDOWS.find((w) => w.key === window)!;
  const since = Math.floor(Date.now() / 1000) - meta.seconds;

  try {
    const [deps, wits, metaRaw] = await Promise.all([
      fetchAllDeposits(since),
      fetchAllWithdrawals(since),
      request(TORNADO_FLOW_ENDPOINT, `{ _meta { block { number } hasIndexingErrors } }`) as Promise<{
        _meta?: { block?: { number: number }; hasIndexingErrors?: boolean };
      }>,
    ]);

    const deposits = deps.rows;
    const withdrawals = wits.rows;
    // truncated only if we intentionally under-sampled — we no longer do that
    const truncated = false;

    const inWei = deposits.reduce((s, d) => s + d.amountWei, 0n);
    const outWei = withdrawals.reduce((s, w) => s + w.amountWei, 0n);
    const feeWei = withdrawals.reduce((s, w) => s + w.feeWei, 0n);

    const indexedBlock = metaRaw._meta?.block?.number ?? null;
    const head = await fetchHeadBlock().catch(() => null);
    const lag =
      head != null && indexedBlock != null
        ? Math.max(0, head - indexedBlock)
        : indexedBlock == null
          ? Number.POSITIVE_INFINITY
          : 0;
    const indexing = lag > 900 || Boolean(metaRaw._meta?.hasIndexingErrors);

    return {
      window,
      since,
      deposits,
      withdrawals,
      inWei,
      outWei,
      feeWei,
      depositCount: deposits.length,
      withdrawalCount: withdrawals.length,
      truncated,
      indexing,
      indexedBlock,
    };
  } catch (error) {
    console.error("[flow] tornado event query failed:", error);
    return {
      window,
      since,
      deposits: [],
      withdrawals: [],
      inWei: 0n,
      outWei: 0n,
      feeWei: 0n,
      depositCount: 0,
      withdrawalCount: 0,
      truncated: false,
      indexing: true,
      indexedBlock: null,
    };
  }
}

const HEAD_RPC =
  process.env.ETH_RPC_URL ??
  process.env.NEXT_PUBLIC_ETH_RPC_URL ??
  "https://ethereum.publicnode.com";

async function fetchHeadBlock(): Promise<number> {
  const res = await fetch(HEAD_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_blockNumber",
      params: [],
    }),
    next: { revalidate: 60 },
  } as RequestInit);
  const json = (await res.json()) as { result?: string; error?: unknown };
  if (!json.result) throw new Error("eth_blockNumber failed");
  return parseInt(json.result, 16);
}

/** All windows in one pass for the client range toggle. */
export const getFlowSnapshots = cache(async (): Promise<Record<FlowWindow, FlowSnapshot>> => {
  const [h24, d7] = await Promise.all([queryWindow("24h"), queryWindow("7d")]);
  return { "24h": h24, "7d": d7 };
});
