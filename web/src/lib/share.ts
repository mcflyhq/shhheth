/**
 * Composes the tweet text for the "Share on X" button. Pure so it can be
 * unit-tested and reused by the OG image / future auto-post engine. The URL is
 * appended by the X intent params, not the text — X renders the link card from
 * the shared page's OG tags.
 */

export type ShareInput = {
  /** All-time total, pre-formatted whole ETH, e.g. "6,050,014". */
  total: string;
  /** Signed window inflow, e.g. "+13,938", or null when unknown. */
  delta: string | null;
  /** True when the window inflow is exactly zero. */
  deltaZero: boolean;
  /** The protocol that drove most of the window's inflow, if any. */
  topMover: { name: string; sharePct: number } | null;
};

export function buildShareText({ total, delta, deltaZero, topMover }: ShareInput): string {
  const lines = [`${total} ETH has been shielded on Ethereum — all-time. 🤫`];

  if (delta && !deltaZero) {
    const mover =
      topMover && topMover.sharePct >= 1
        ? `, ${topMover.name} driving ${Math.round(topMover.sharePct)}% of it`
        : "";
    lines.push("", `This week: ${delta} ETH${mover}.`);
  } else if (delta && deltaZero) {
    lines.push("", "This week: flat.");
  }

  lines.push("", "the quiet index for shielded ETH ↓");
  return lines.join("\n");
}
