export default function Methodology() {
  return (
    <section className="methodology-section" aria-label="How we count">
      <p className="methodology-eyebrow">
        <span className="methodology-eyebrow-line" aria-hidden="true" />
        The quiet print
      </p>
      <h2 className="methodology-title">
        <span className="methodology-title-heavy">How we count.</span>
        <span className="methodology-title-soft">Plainly stated.</span>
      </h2>
      <div className="methodology-body">
        <p>
          shhh records every deposit that entered a privacy protocol on
          Ethereum. The number is cumulative and only grows. Withdrawals and
          reshielding events are intentionally not subtracted — a historical
          record of capital that chose to disappear, not a live TVL dashboard.
        </p>
        <p>
          <strong>Only ETH is counted.</strong> Native ETH and WETH (which we
          count as ETH). Stablecoins and other tokens shielded through these
          protocols are not in the number.
        </p>
        <p>
          All data comes from public on-chain events indexed by subgraphs.
        </p>
      </div>
    </section>
  );
}
