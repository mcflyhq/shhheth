"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import BraunDigits from "./BraunDigits";
import SiteHeader from "./SiteHeader";

type Mode = "day" | "night";

type Props = {
  formattedTotal: string;
  isLive: boolean;
  children?: React.ReactNode;
};

const MODE_STORAGE_KEY = "shhheth-mode";

export default function OdometerStage({ formattedTotal, isLive, children }: Props) {
  const [onScreen, setOnScreen] = useState(false);
  const [mode, setMode] = useState<Mode>("day");
  const stageRef = useRef<HTMLElement | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const stageRectRef = useRef<DOMRect | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(MODE_STORAGE_KEY);
    if (saved === "day" || saved === "night") {
      setMode(saved);
    }
  }, []);

  const toggleMode = useCallback(() => {
    setMode((prev) => {
      const next: Mode = prev === "day" ? "night" : "day";
      window.localStorage.setItem(MODE_STORAGE_KEY, next);
      return next;
    });
  }, []);

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
      data-mode={mode}
      onPointerMove={updateCursor}
      onPointerEnter={updateCursor}
      onPointerLeave={leaveStage}
    >
      <div className="ambient-noise" aria-hidden="true" />
      <SiteHeader />

      <button
        type="button"
        className="mode-toggle"
        onClick={toggleMode}
        aria-label={mode === "day" ? "Switch to night mode" : "Switch to day mode"}
        aria-pressed={mode === "night"}
      >
        {mode === "day" ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
        )}
      </button>

      <div className="screen-frame" ref={screenRef} aria-hidden="true">
        <div className="screen-glow" />
        <div className="screen-surface" />
        <div className="screen-content">
          <BraunDigits value={formattedTotal} />
          <p className="screen-sublabel">
            <span className={`live-dot ${isLive ? "live-dot-on" : "live-dot-off"}`} aria-hidden="true" />
            ever shielded · and counting
          </p>
        </div>
      </div>

      <div className="lens-halo" aria-hidden="true" />

      <div className="below-fold">{children}</div>
    </section>
  );
}
