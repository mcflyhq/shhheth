type Props = {
  value: string;
  suffix?: string;
};

export default function BraunDigits({ value, suffix = "ETH" }: Props) {
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

function ghostFor(value: string): string {
  // DSEG7 renders "8" as a fully-lit segment. Show a faint ghost of all
  // segments behind the real digits, like a real LCD where unlit segments
  // are still faintly visible.
  return value.replace(/\d/g, "8");
}
