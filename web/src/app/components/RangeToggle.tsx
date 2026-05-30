"use client";

import { memo } from "react";
import type { RangeKey } from "@/lib/daily";

type Props = {
  ranges: { key: RangeKey; label: string }[];
  active: RangeKey;
  onChange: (key: RangeKey) => void;
};

const SHORT: Record<RangeKey, string> = { "7d": "7D", "30d": "30D", "90d": "90D", all: "ALL" };

function RangeToggle({ ranges, active, onChange }: Props) {
  return (
    <div className="range-toggle" role="tablist" aria-label="Time range">
      {ranges.map((r) => (
        <button
          key={r.key}
          type="button"
          role="tab"
          aria-selected={r.key === active}
          className={`range-toggle-btn range-toggle-btn-${r.key}${r.key === active ? " is-active" : ""}`}
          onClick={() => onChange(r.key)}
        >
          {SHORT[r.key]}
        </button>
      ))}
    </div>
  );
}

export default memo(RangeToggle);
