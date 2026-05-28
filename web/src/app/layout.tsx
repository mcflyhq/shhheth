import type { Metadata } from "next";
import localFont from "next/font/local";
import { DM_Sans } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  weight: ["400", "500", "600", "700"],
  style: "normal",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = localFont({
  variable: "--font-geist-mono",
  display: "swap",
  src: [
    { path: "./fonts/GeistMono-400.ttf", weight: "400", style: "normal" },
    { path: "./fonts/GeistMono-500.ttf", weight: "500", style: "normal" },
    { path: "./fonts/GeistMono-600.ttf", weight: "600", style: "normal" },
    { path: "./fonts/GeistMono-700.ttf", weight: "700", style: "normal" },
  ],
});

const dseg7 = localFont({
  variable: "--font-dseg7",
  display: "swap",
  src: [{ path: "./fonts/DSEG7Classic-Bold.woff2", weight: "700", style: "normal" }],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://shhheth.xyz";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "shhheth — every ETH that ever went private",
  description:
    "Live counter of all ETH ever shielded into Ethereum privacy protocols. Cumulative, not TVL. Goes up only.",
  openGraph: {
    title: "shhheth — every ETH that ever went private",
    description:
      "Live counter of all ETH ever shielded into Ethereum privacy protocols. Cumulative, not TVL. Goes up only.",
    url: siteUrl,
    siteName: "shhheth",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "shhheth — every ETH that ever went private",
    description:
      "Live counter of all ETH ever shielded into Ethereum privacy protocols. Cumulative, not TVL. Goes up only.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${geistMono.variable} ${dseg7.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
