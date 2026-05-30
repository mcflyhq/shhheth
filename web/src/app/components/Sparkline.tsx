import { memo } from "react";

type Props = { values: number[]; color: string };

function Sparkline({ values, color }: Props) {
  if (values.length < 2) return <svg className="sparkline" aria-hidden="true" />;
  const max = Math.max(1e-9, ...values);
  const n = values.length;
  const pts = values
    .map((v, i) => `${(i / (n - 1)) * 100},${20 - (v / max) * 20}`)
    .join(" ");
  return (
    <svg className="sparkline" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default memo(Sparkline);
