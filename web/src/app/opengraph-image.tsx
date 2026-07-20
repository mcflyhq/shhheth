import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { formatETH, formatSignedETH, getTotals } from "@/lib/subgraph";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "shhheth · the quiet index for shielded ETH";

const PAPER = "#eef3f7";
const MUTED = "rgba(238, 247, 255, 0.55)";
const GREEN = "#2fd08a";

export default async function OpengraphImage() {
  const snapshot = await getTotals();
  const total = formatETH(snapshot.totalETH, 0);
  const delta =
    snapshot.deltaETH !== null && snapshot.deltaETH !== 0n
      ? formatSignedETH(snapshot.deltaETH, 0)
      : null;

  let mono700: Buffer | null = null;
  let mono500: Buffer | null = null;
  try {
    [mono700, mono500] = await Promise.all([
      readFile(join(process.cwd(), "src/app/fonts/GeistMono-700.ttf")),
      readFile(join(process.cwd(), "src/app/fonts/GeistMono-500.ttf")),
    ]);
  } catch {
    mono700 = null;
    mono500 = null;
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#050604",
          color: PAPER,
          padding: "76px",
          fontFamily: "GeistMono",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "18px", fontSize: "42px", fontWeight: 700, letterSpacing: "0.04em" }}>
          <span>shhh</span>
          <span
            style={{
              width: "46px",
              height: "46px",
              borderRadius: "999px",
              border: `3px solid ${PAPER}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "24px",
            }}
          >
            🤫
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "22px" }}>
            <span style={{ fontSize: "146px", fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em" }}>{total}</span>
            <span style={{ fontSize: "48px", fontWeight: 500, color: MUTED }}>ETH</span>
          </div>
          <span style={{ fontSize: "30px", fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase", color: MUTED }}>
            shielded on Ethereum · all-time
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {delta ? (
            <div style={{ display: "flex", alignItems: "center", gap: "16px", fontSize: "36px", fontWeight: 700, color: GREEN }}>
              <span>▲</span>
              <span>{delta} ETH</span>
              <span style={{ fontSize: "27px", fontWeight: 500, color: MUTED, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                this week
              </span>
            </div>
          ) : (
            <div style={{ display: "flex" }} />
          )}
          <span style={{ fontSize: "31px", fontWeight: 500, color: "rgba(238, 247, 255, 0.72)" }}>shhheth.com</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts:
        mono700 && mono500
          ? [
              { name: "GeistMono", data: mono700, weight: 700, style: "normal" },
              { name: "GeistMono", data: mono500, weight: 500, style: "normal" },
            ]
          : undefined,
    },
  );
}
