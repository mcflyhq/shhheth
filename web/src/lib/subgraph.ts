import { gql, GraphQLClient } from "graphql-request";

export type ProtocolSnapshot = {
  id: string;
  name: string;
  totalETH: string;
  depositCount: string;
};

export type Snapshot = {
  totalETH: string;
  depositCount: string;
  lastUpdatedBlock: string;
  lastUpdatedTimestamp: string;
  protocols: ProtocolSnapshot[];
};

type RawResponse = {
  globalCounter: {
    totalETH: string;
    depositCount: string;
    lastUpdatedBlock: string;
    lastUpdatedTimestamp: string;
  } | null;
  protocolCounters: ProtocolSnapshot[];
};

const QUERY = gql`
  query Totals {
    globalCounter(id: "global") {
      totalETH
      depositCount
      lastUpdatedBlock
      lastUpdatedTimestamp
    }
    protocolCounters {
      id
      name
      totalETH
      depositCount
    }
  }
`;

export async function getTotals(): Promise<Snapshot | null> {
  const endpoint = process.env.GOLDSKY_ENDPOINT;
  if (!endpoint) {
    return null;
  }

  try {
    const client = new GraphQLClient(endpoint, { fetch });
    const data = await client.request<RawResponse>(QUERY);
    if (!data.globalCounter) {
      return null;
    }
    return {
      totalETH: data.globalCounter.totalETH,
      depositCount: data.globalCounter.depositCount,
      lastUpdatedBlock: data.globalCounter.lastUpdatedBlock,
      lastUpdatedTimestamp: data.globalCounter.lastUpdatedTimestamp,
      protocols: data.protocolCounters,
    };
  } catch (error) {
    console.error("[shhheth] subgraph query failed:", error);
    return null;
  }
}

const WEI_PER_ETH = 10n ** 18n;

export function formatETH(wei: string, decimals = 3): string {
  const value = BigInt(wei || "0");
  const whole = value / WEI_PER_ETH;
  const remainder = value % WEI_PER_ETH;
  const fractional = remainder
    .toString()
    .padStart(18, "0")
    .slice(0, decimals);
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decimals > 0 ? `${wholeStr}.${fractional}` : wholeStr;
}
