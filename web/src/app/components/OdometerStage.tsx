"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import BraunDigits from "./BraunDigits";
import SiteHeader from "./SiteHeader";

type Props = {
  formattedTotal: string;
  isLive: boolean;
  children?: React.ReactNode;
};

export default function OdometerStage({ formattedTotal, isLive, children }: Props) {
  const [onScreen, setOnScreen] = useState(false);
  const stageRef = useRef<HTMLElement | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const stageRectRef = useRef<DOMRect | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const refresh = () => {
      stageRectRef.current = stage.getBoundingClientRect();
    };
    const invalidate = () => {
      stageRectRef.current = null;
    };

    refresh();
    const observer = new ResizeObserver(refresh);
    observer.observe(stage);
    window.addEventListener("scroll", invalidate, { passive: true, capture: true });
    window.addEventListener("resize", refresh, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", invalidate, { capture: true });
      window.removeEventListener("resize", refresh);
    };
  }, []);

  const updateCursor = useCallback((event: PointerEvent<HTMLElement>) => {
    const target = event.currentTarget;
    let stageRect = stageRectRef.current;
    if (!stageRect) {
      stageRect = target.getBoundingClientRect();
      stageRectRef.current = stageRect;
    }

    target.style.setProperty("--lens-x", `${event.clientX - stageRect.left}px`);
    target.style.setProperty("--lens-y", `${event.clientY - stageRect.top}px`);

    const screen = screenRef.current;
    if (!screen) {
      setOnScreen((prev) => (prev ? false : prev));
      return;
    }

    const screenRect = screen.getBoundingClientRect();
    const inside =
      event.clientX >= screenRect.left &&
      event.clientX <= screenRect.right &&
      event.clientY >= screenRect.top &&
      event.clientY <= screenRect.bottom;

    setOnScreen((prev) => (prev === inside ? prev : inside));
  }, []);

  const leaveStage = useCallback(() => {
    setOnScreen(false);
  }, []);

  const className = ["lens-stage", onScreen ? "lens-active" : "lens-idle"]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      ref={stageRef}
      className={className}
      onPointerMove={updateCursor}
      onPointerEnter={updateCursor}
      onPointerLeave={leaveStage}
    >
      <div className="ambient-noise" aria-hidden="true" />
      <SiteHeader />

      <div className="screen-frame" ref={screenRef} aria-hidden="true">
        <div className="screen-glow" />
        <div className="screen-surface" />
        <div className="screen-content">
          <BraunDigits value={formattedTotal} />
          <p className="screen-sublabel">
            <span className={`live-dot ${isLive ? "live-dot-on" : "live-dot-off"}`} aria-hidden="true" />
            ETH · ever shielded · and counting
          </p>
        </div>
      </div>

      <div className="lens-halo" aria-hidden="true" />

      <div className="below-fold">
        <div className="hero-tagline">
          <p className="hero-shhh" aria-hidden="true">shhh.</p>
          <h1 className="hero-line">
            <span className="hero-line-heavy">Every ETH that ever went private.</span>
            <span className="hero-line-soft">Counted. And counting.</span>
          </h1>
        </div>
        {children}
        <footer className="site-footer">
          <span>built by anon · for anon</span>
          <span className="site-footer-sep" aria-hidden="true">·</span>
          <span>we see the proof. we don&apos;t tell.</span>
        </footer>
      </div>
    </section>
  );
}
