import { memo } from "react";

type Props = {
  value: string;
  suffix?: string;
};

function BraunDigits({ value, suffix = "ETH" }: Props) {
  return (
    <div className="braun-digits" aria-label={`${value} ${suffix} ever shielded`}>
      <span className="braun-digits-ghost" aria-hidden="true">
        {ghostFor(value)}
      </span>
      <span className="braun-digits-value">{value}</span>
      <span className="braun-digits-suffix">{suffix}</span>
    </div>
  );
}

// React.memo so OdometerStage's cursor-enter/leave state changes don't
// re-render the digits when the displayed value is unchanged.
export default memo(BraunDigits);

function ghostFor(value: string): string {
  // DSEG7 renders "8" as a fully-lit segment. Show a faint ghost of all
  // segments behind the real digits, like a real LCD where unlit segments
  // are still faintly visible.
  return value.replace(/\d/g, "8");
}
