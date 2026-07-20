"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { FLOW_URL, SITE_URL } from "@/lib/site";

export type PageView = "index" | "flow";

type Props = {
  /** Which view is current — styles the site nav. */
  view: PageView;
};

/**
 * Shared brand mast: hollow "shhh" logo, quiet-index subtitle, and a
 * two-item nav between the index (shhheth.com) and Tornado flow (flow.shhheth.com).
 */
export default function PageMast({ view }: Props) {
  const [letterBox, setLetterBox] = useState({ x: 0, w: 360 });
  const shhhTextRef = useRef<SVGTextElement | null>(null);

  /* Snap the letter SVG's viewBox to the actual rendered text. Without this,
   * the SVG carries a fixed-width box of empty pixels to the right of "shhh",
   * which pushes the dot away from the letters in the flex row. */
  useLayoutEffect(() => {
    const measure = () => {
      if (!shhhTextRef.current) return;
      const bbox = shhhTextRef.current.getBBox();
      if (bbox.width > 0) {
        setLetterBox({
          x: Math.floor(bbox.x),
          w: Math.ceil(bbox.width + 4),
        });
      }
    };
    measure();
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(measure).catch(() => {});
    }
    window.addEventListener("resize", measure, { passive: true });
    return () => window.removeEventListener("resize", measure);
  }, []);

  const indexHref = view === "index" ? "/" : SITE_URL;
  const flowHref = view === "flow" ? "/" : FLOW_URL;
  // Cross-origin needs a plain anchor so we leave the other product host.
  const IndexTag = view === "index" ? Link : "a";
  const FlowTag = view === "flow" ? Link : "a";

  return (
    <div className="page-mast">
      <h1
        className="hero-shhh-logo"
        aria-label={
          view === "flow"
            ? "shhh, Tornado Cash pool flow"
            : "shhh, the quiet index"
        }
      >
        <svg
          className="hero-shhh-letters"
          viewBox={`${letterBox.x} 0 ${letterBox.w} 200`}
          preserveAspectRatio="xMidYMax meet"
          role="img"
          aria-hidden="true"
        >
          <text
            ref={shhhTextRef}
            x="0"
            y="178"
            textAnchor="start"
            dominantBaseline="alphabetic"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinejoin="round"
            strokeLinecap="round"
            className="hero-shhh-text"
          >
            shhh
          </text>
        </svg>
        <span className="hero-shhh-dot" aria-hidden="true">
          <svg className="hero-shhh-dot-ring" viewBox="0 0 100 100" aria-hidden="true">
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <span className="hero-shhh-emoji">🤫</span>
        </span>
      </h1>
      <p className="hero-subtitle">
        {view === "flow"
          ? "Tornado Cash Flow."
          : "The quiet index for shielded ETH."}
      </p>
      <nav className="site-view-nav" aria-label="Site views">
        <IndexTag
          href={indexHref}
          className={`site-view-nav-link${view === "index" ? " is-active" : ""}`}
          aria-current={view === "index" ? "page" : undefined}
        >
          quiet index
        </IndexTag>
        <span className="site-view-nav-sep" aria-hidden="true">
          ·
        </span>
        <FlowTag
          href={flowHref}
          className={`site-view-nav-link${view === "flow" ? " is-active" : ""}`}
          aria-current={view === "flow" ? "page" : undefined}
        >
          tornado flow
        </FlowTag>
      </nav>
    </div>
  );
}
