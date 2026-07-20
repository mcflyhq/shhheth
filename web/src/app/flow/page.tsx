import type { Metadata } from "next";
import FlowStage from "../components/FlowStage";
import { getFlowSnapshots } from "@/lib/flow-data";
import type { FlowWindow } from "@/lib/flow";

export const revalidate = 60;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://shhheth.com";

export const metadata: Metadata = {
  title: "tornado flow · shhheth",
  description:
    "Tornado Cash only: deposits and withdrawals through ETH pools. Not the full quiet index.",
  openGraph: {
    title: "tornado flow · shhheth",
    description:
      "Tornado Cash ETH pool flow only. Deposits in, withdrawals out.",
    url: `${SITE_URL}/flow`,
    siteName: "shhheth",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "tornado flow · shhheth",
    description:
      "Tornado Cash ETH pool flow only. Deposits in, withdrawals out.",
  },
};

function serialize() {
  return getFlowSnapshots().then((snaps) => {
    const out = {} as Record<
      FlowWindow,
      {
        window: FlowWindow;
        since: number;
        deposits: Array<{
          id: string;
          pool: "0.1" | "1" | "10" | "100";
          amountWei: string;
          from: string;
          timestamp: number;
          blockNumber: number;
          txHash: string;
        }>;
        withdrawals: Array<{
          id: string;
          pool: "0.1" | "1" | "10" | "100";
          amountWei: string;
          to: string;
          relayer: string;
          feeWei: string;
          timestamp: number;
          blockNumber: number;
          txHash: string;
        }>;
        inWei: string;
        outWei: string;
        feeWei: string;
        depositCount: number;
        withdrawalCount: number;
        truncated: boolean;
        indexing: boolean;
        indexedBlock: number | null;
      }
    >;
    for (const key of ["24h", "7d"] as FlowWindow[]) {
      const s = snaps[key];
      out[key] = {
        window: s.window,
        since: s.since,
        deposits: s.deposits.map((d) => ({
          ...d,
          amountWei: d.amountWei.toString(),
        })),
        withdrawals: s.withdrawals.map((w) => ({
          ...w,
          amountWei: w.amountWei.toString(),
          feeWei: w.feeWei.toString(),
        })),
        inWei: s.inWei.toString(),
        outWei: s.outWei.toString(),
        feeWei: s.feeWei.toString(),
        depositCount: s.depositCount,
        withdrawalCount: s.withdrawalCount,
        truncated: s.truncated,
        indexing: s.indexing,
        indexedBlock: s.indexedBlock,
      };
    }
    return out;
  });
}

export default async function FlowPage() {
  const snapshots = await serialize();
  return (
    <main>
      <FlowStage snapshots={snapshots} />
    </main>
  );
}
