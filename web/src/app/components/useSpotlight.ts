"use client";

import { useCallback, useEffect, useRef, type PointerEvent } from "react";

/**
 * useSpotlight — adapted from foglight. Writes --mx / --my CSS vars onto any
 * [data-spotlight] descendant of the returned ref. One container handles many
 * cards; rects are cached per element via WeakMap and invalidated on
 * scroll / resize.
 */
export function useSpotlight<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);
  const rectCacheRef = useRef<WeakMap<HTMLElement, DOMRect>>(new WeakMap());

  useEffect(() => {
    const invalidate = () => {
      rectCacheRef.current = new WeakMap();
    };
    window.addEventListener("scroll", invalidate, { passive: true, capture: true });
    window.addEventListener("resize", invalidate, { passive: true });
    return () => {
      window.removeEventListener("scroll", invalidate, { capture: true });
      window.removeEventListener("resize", invalidate);
    };
  }, []);

  const onPointerMove = useCallback((event: PointerEvent<T>) => {
    const eventTarget = event.target;
    if (!(eventTarget instanceof Element)) return;
    const card = eventTarget.closest<HTMLElement>("[data-spotlight]");
    if (!card || !event.currentTarget.contains(card)) return;

    let rect = rectCacheRef.current.get(card);
    if (!rect) {
      rect = card.getBoundingClientRect();
      rectCacheRef.current.set(card, rect);
    }
    card.style.setProperty("--mx", `${event.clientX - rect.left}px`);
    card.style.setProperty("--my", `${event.clientY - rect.top}px`);
  }, []);

  return { ref, onPointerMove };
}
