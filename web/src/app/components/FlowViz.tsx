"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type UIEvent,
} from "react";
import {
  FLOW_LIST_MAX,
  FLOW_LIST_PAGE,
  FLOW_WINDOWS,
  OUT_ROW_HOVER,
  POOL_CHIP_COLORS,
  POOL_META,
  POOL_ORDER,
  addressColor,
  formatCount,
  formatEthWei,
  safeBigInt,
  shortAddr,
  type FlowDeposit,
  type FlowPool,
  type FlowSnapshot,
  type FlowWindow,
  type FlowWithdrawal,
} from "@/lib/flow";

type SerializableSnapshot = {
  window: FlowWindow;
  since: number;
  deposits: Array<Omit<FlowDeposit, "amountWei"> & { amountWei: string }>;
  withdrawals: Array<
    Omit<FlowWithdrawal, "amountWei" | "feeWei"> & {
      amountWei: string;
      feeWei: string;
    }
  >;
  inWei: string;
  outWei: string;
  feeWei: string;
  depositCount: number;
  withdrawalCount: number;
  truncated: boolean;
  indexing: boolean;
  indexedBlock: number | null;
};

type Props = {
  snapshots: Record<FlowWindow, SerializableSnapshot>;
};

/**
 * Hourglass particle:
 *  inputs:  (left edge @ row swatch Y)  ──► pool center
 *  outputs: pool center ──► (right edge @ row swatch Y)
 * edgeY is measured from the parent row’s colored swatch whenever possible.
 */
type Particle = {
  id: string;
  eventId: string;
  pool: FlowPool;
  address: string;
  /** Lowercased once — hover match without per-frame toLowerCase */
  addressLower: string;
  /** Precomputed draw color (inputs: address hue; outputs: neutral) */
  color: string;
  side: 0 | 1;
  /** Fallback rank if measure fails (0..1) */
  slot: number;
  t: number;
  speed: number;
  phase: number;
  pathJitter: number;
  /** Flight size (denom-based) */
  edge: number;
  /** Canvas-space coords of the parent list swatch (updated on scroll/sync) */
  anchorX: number;
  anchorY: number;
  /** Parent swatch size for matched departure/arrival */
  anchorSize: number;
  /** True when anchors come from a live DOM measure */
  anchored: boolean;
};

/** Stacked layout (inputs → viz → outputs, horizontal row strips). */
const STACKED_MQ = "(max-width: 900px)";

function revive(s: SerializableSnapshot): FlowSnapshot {
  const deposits = (s.deposits ?? []).map((d) => ({
    ...d,
    amountWei: safeBigInt(d.amountWei),
    from: d.from || "0x",
    pool: d.pool,
  }));
  const withdrawals = (s.withdrawals ?? []).map((w) => ({
    ...w,
    amountWei: safeBigInt(w.amountWei),
    feeWei: safeBigInt(w.feeWei),
    to: w.to || "0x",
    pool: w.pool,
  }));
  return {
    window: s.window,
    since: s.since,
    deposits,
    withdrawals,
    inWei: safeBigInt(s.inWei),
    outWei: safeBigInt(s.outWei),
    feeWei: safeBigInt(s.feeWei),
    depositCount: s.depositCount ?? deposits.length,
    withdrawalCount: s.withdrawalCount ?? withdrawals.length,
    truncated: s.truncated,
    indexing: s.indexing,
    indexedBlock: s.indexedBlock,
  };
}

function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

const BASE_TRAVERSE_SEC = 8;

const SPEED_OPTIONS = [
  { key: 1, label: "1×" },
  { key: 2, label: "2×" },
  { key: 5, label: "5×" },
  { key: 10, label: "10×" },
] as const;

type SpeedMult = (typeof SPEED_OPTIONS)[number]["key"];

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInCubic(t: number): number {
  return t * t * t;
}

/** Smoothstep-ish ease-out-quart for calm, purposeful travel. */
function easeOutQuart(t: number): number {
  const u = 1 - Math.min(1, Math.max(0, t));
  return 1 - u * u * u * u;
}

/**
 * Continuous path progress — slight ease-out so cubes settle into the pool
 * (and peel from the edge) without looking mechanical.
 */
function travelEase(t: number, _side: 0 | 1): number {
  const x = Math.min(1, Math.max(0, t));
  // Blend inOutCubic body with a soft ease-out so mid-flight stays readable
  return 0.55 * easeInOutCubic(x) + 0.45 * easeOutQuart(x);
}

/**
 * Same 3×3 fleck feel as CSS chip-dot fills — solid band + 1px rects.
 * (Avoid createPattern under a DPR setTransform; it can paint blank.)
 */
function paintChipDotPattern(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  dotAlpha = 0.42,
) {
  if (!(w > 0) || !(h > 0)) return;
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  // Sparse flecks — fillRect only (no beginPath/arc)
  ctx.fillStyle = `rgba(255,255,255,${dotAlpha})`;
  const x1 = Math.floor(x);
  const y1 = Math.floor(y);
  const x2 = Math.ceil(x + w);
  const y2 = Math.ceil(y + h);
  for (let yy = y1; yy < y2; yy += 3) {
    for (let xx = x1; xx < x2; xx += 3) {
      ctx.fillRect(xx + 1, yy + 1, 1, 1);
    }
  }
}

/**
 * Path flecks (comet wake). Fixed fillStyle + globalAlpha — no per-dot string alloc.
 * steps=12 is enough once soft-trail smoke is gone.
 */
function strokePixelPath(
  ctx: CanvasRenderingContext2D,
  path: { x0: number; y0: number; cpx: number; cpy: number; x1: number; y1: number },
  alpha: number,
  phase: number,
  progress = 1,
) {
  const steps = 12;
  const cap = Math.min(1, Math.max(0.04, progress));
  const prevA = ctx.globalAlpha;
  ctx.fillStyle = "rgba(238, 247, 255, 1)";
  for (let i = 0; i <= steps; i++) {
    if ((i + phase) % 2 === 1) continue;
    const t = i / steps;
    if (t > cap) continue;
    const lead = 0.35 + 0.65 * (t / cap);
    ctx.globalAlpha = alpha * lead;
    const x = bez(t, path.x0, path.cpx, path.x1);
    const y = bez(t, path.y0, path.cpy, path.y1);
    ctx.fillRect(x - 0.5, y - 0.5, 1.1, 1.1);
  }
  ctx.globalAlpha = prevA;
}

/** Row intersects its list scrollport (both axes — vertical or horizontal strips). */
function isVisibleInList(
  el: HTMLElement,
  listRect: DOMRect,
): boolean {
  const er = el.getBoundingClientRect();
  if (er.width < 1 && er.height < 1) return false;
  // Strict intersection — no off-screen margin (cubes only for rows in view)
  return (
    er.bottom > listRect.top &&
    er.top < listRect.bottom &&
    er.right > listRect.left &&
    er.left < listRect.right
  );
}

/**
 * Map a list swatch into canvas-local coordinates.
 * LR: y tracks the row; TB (stacked): x tracks the chip in the horizontal strip.
 * Prefers a cached swatch node (no querySelector on the hot path).
 */
function measureSwatchAnchor(
  eventId: string,
  rowEls: Map<string, HTMLElement>,
  swatchEls: Map<string, HTMLElement>,
  canvasRect: DOMRect,
  side: 0 | 1,
  fallbackX: number,
  fallbackY: number,
  fallbackSize: number,
): { x: number; y: number; size: number; anchored: boolean } {
  let sw = swatchEls.get(eventId);
  if (!sw) {
    const el = rowEls.get(eventId);
    if (!el) {
      return { x: fallbackX, y: fallbackY, size: fallbackSize, anchored: false };
    }
    sw = el.querySelector<HTMLElement>("[data-swatch]") ?? el;
    swatchEls.set(eventId, sw);
  }
  const r = sw.getBoundingClientRect();
  if (r.width < 1 && r.height < 1) {
    return { x: fallbackX, y: fallbackY, size: fallbackSize, anchored: false };
  }
  const x = r.left + r.width / 2 - canvasRect.left;
  const y = r.top + r.height / 2 - canvasRect.top;
  // Soft band so near-edge scrolled rows still track
  const clampedX = Math.max(-24, Math.min(canvasRect.width + 24, x));
  const clampedY = Math.max(-24, Math.min(canvasRect.height + 24, y));
  const size = Math.max(3, Math.min(16, Math.min(r.width, r.height) * 0.92));
  void side;
  return { x: clampedX, y: clampedY, size, anchored: true };
}

/** Visible row ids only — used to skip full particle rebuild on scroll. */
function visibleIdFingerprint(
  rows: Array<{ id: string }>,
  list: HTMLUListElement | null,
  rowEls: Map<string, HTMLElement>,
): string {
  if (!list) return "";
  const listRect = list.getBoundingClientRect();
  const ids: string[] = [];
  for (const row of rows) {
    const el = rowEls.get(row.id);
    if (el && isVisibleInList(el, listRect)) ids.push(row.id);
  }
  return ids.join("|");
}

/** Quadratic bezier path — LR hourglass, or TB funnel when stacked. */
function hourglassPath(
  p: Particle,
  canvasW: number,
  canvasH: number,
  stacked: boolean,
): { x0: number; y0: number; cpx: number; cpy: number; x1: number; y1: number; edgeY: number } {
  const midX = canvasW * 0.5;
  const midY = canvasH * 0.5;
  const barW = Math.max(16, Math.min(28, canvasW * 0.05));
  const barH = Math.max(14, Math.min(22, canvasH * 0.06));
  // Flush with the canvas edge so the cube continues the list swatch (no gap)
  const pad = 1;
  const top = canvasH * 0.07;
  const bot = canvasH * 0.93;
  const left = canvasW * 0.07;
  const right = canvasW * 0.93;
  const spanY = bot - top;
  const spanX = right - left;
  const jY = (p.pathJitter - 0.5) * spanY * 0.12;
  const jX = (p.pathJitter - 0.5) * spanX * 0.12;

  if (stacked) {
    // Hourglass into a horizontal pool belt: top chips → center → bottom chips.
    const barTh = Math.max(16, Math.min(26, canvasH * 0.055));
    const barTop = midY - barTh * 0.5;
    const barBot = midY + barTh * 0.5;
    const fallbackX = left + p.slot * spanX;
    const edgeX = p.anchored
      ? Math.max(left, Math.min(right, p.anchorX))
      : fallbackX;
    // Pinch toward bar center so paths read as a true hourglass, not rain lines
    const pinchX = midX + (edgeX - midX) * 0.16 + jX * 0.4;
    if (p.side === 0) {
      return {
        x0: edgeX,
        y0: pad + 2,
        cpx: edgeX * 0.28 + midX * 0.72 + jX * 0.2,
        cpy: canvasH * 0.28,
        x1: pinchX,
        y1: barTop - 3,
        edgeY: edgeX,
      };
    }
    return {
      x0: pinchX,
      y0: barBot + 3,
      cpx: edgeX * 0.28 + midX * 0.72 + jX * 0.2,
      cpy: canvasH * 0.72,
      x1: edgeX,
      y1: canvasH - pad - 2,
      edgeY: edgeX,
    };
  }

  const fallbackY = top + p.slot * spanY;
  const edgeY = p.anchored ? p.anchorY : fallbackY;
  if (p.side === 0) {
    return {
      x0: pad,
      y0: edgeY,
      cpx: midX * 0.5,
      cpy: midY + jY * 0.85,
      x1: midX - barW * 0.18,
      y1: midY + jY * 0.15,
      edgeY,
    };
  }
  return {
    x0: midX + barW * 0.18,
    y0: midY + jY * 0.15,
    cpx: midX + (canvasW - midX) * 0.5,
    cpy: midY + jY * 0.85,
    x1: canvasW - pad,
    y1: edgeY,
    edgeY,
  };
}

function bez(t: number, a: number, b: number, c: number): number {
  const o = 1 - t;
  return o * o * a + 2 * o * t * b + t * t * c;
}

/**
 * Sample position/size along the hourglass with transient depart/arrive.
 * Near t=0 (inputs) size matches the parent swatch; near t=1 (outputs) too.
 */
function sampleHourglass(
  p: Particle,
  canvasW: number,
  canvasH: number,
  timeSec: number,
  stacked: boolean,
  reducedMotion = false,
): {
  x: number;
  y: number;
  size: number;
  glow: number;
  path: ReturnType<typeof hourglassPath>;
  /** 1 at parent, 0 mid-flight — for peel-off styling */
  parentBlend: number;
  /** Eased travel progress used for pinch fade */
  u: number;
  /** Soft loop fade so cube birth/death doesn't pop */
  cycleFade: number;
} {
  const path = hourglassPath(p, canvasW, canvasH, stacked);
  // Reduced motion: freeze mid-flight so the hourglass still reads as structure
  const t = reducedMotion ? 0.42 : p.t;
  const u = travelEase(t, p.side);
  const x = bez(u, path.x0, path.cpx, path.x1);
  const y = bez(u, path.y0, path.cpy, path.y1);

  const scint = reducedMotion
    ? 0.72
    : 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(timeSec * 7.2 + p.phase * 1.8));
  // Suppress wobble at the row edge so alignment stays crisp
  const edgeSoft =
    p.side === 0
      ? Math.min(1, t / 0.18)
      : Math.min(1, (1 - t) / 0.18);
  const wobble = reducedMotion
    ? 0
    : Math.sin(timeSec * 4.2 + p.phase) * 1.1 * Math.sin(t * Math.PI) * edgeSoft;

  const pinch = 1 - 0.38 * Math.sin(Math.PI * Math.min(1, Math.max(0, (u - 0.05) / 0.9)));
  const flightSize = Math.max(2.2, p.edge * pinch * (0.95 + 0.12 * scint));

  // Blend size toward parent swatch at depart (in) / arrive (out)
  let parentBlend = 0;
  if (p.side === 0 && t < 0.14) {
    parentBlend = 1 - easeOutCubic(t / 0.14);
  } else if (p.side === 1 && t > 0.82) {
    parentBlend = easeInCubic((t - 0.82) / 0.18);
  }
  const parentSize = p.anchorSize > 0 ? p.anchorSize : p.edge;
  const size = flightSize * (1 - parentBlend) + parentSize * parentBlend;

  // Soft loop wrap so restarting t doesn't flash
  let cycleFade = 1;
  if (!reducedMotion) {
    if (p.t < 0.06) cycleFade = easeOutCubic(p.t / 0.06);
    else if (p.t > 0.94) cycleFade = easeOutCubic((1 - p.t) / 0.06);
  }

  return {
    x: x + wobble * 0.15,
    y: y + wobble,
    size,
    glow: scint,
    path,
    parentBlend,
    u,
    cycleFade,
  };
}

/** Cube with 1px corners — matches CSS `.flow-row-swatch { border-radius: 1px }`. */
function drawCube(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
  opts?: { glow?: boolean; glowStrength?: number },
) {
  const half = size / 2;
  const r = 1; // same as list swatches
  // Soft bloom without createRadialGradient (alloc + stops every cube)
  if (opts?.glow) {
    const s = opts.glowStrength ?? 0.35;
    const prevA = ctx.globalAlpha;
    ctx.globalAlpha = prevA * 0.22 * s;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, size * 1.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = prevA;
  }
  ctx.fillStyle = color;
  if (size < 4) {
    // Tiny cubes: plain rect is cheaper and visually identical
    ctx.fillRect(x - half, y - half, size, size);
  } else {
    roundRectPath(ctx, x - half, y - half, size, size, r);
    ctx.fill();
  }
}

function FlowViz({ snapshots }: Props) {
  const [windowKey, setWindowKey] = useState<FlowWindow>("24h");
  const [speedMult, setSpeedMult] = useState<SpeedMult>(10);
  const [filterPools, setFilterPools] = useState<Set<FlowPool>>(() => new Set());
  const [listLimit, setListLimit] = useState(FLOW_LIST_PAGE);
  const [hoveredPool, setHoveredPool] = useState<FlowPool | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoveredAddress, setHoveredAddress] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  /** Stacked mobile/tablet layout (inputs → viz → outputs). */
  const [stacked, setStacked] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inListRef = useRef<HTMLUListElement | null>(null);
  const outListRef = useRef<HTMLUListElement | null>(null);
  const rowElsRef = useRef<Map<string, HTMLElement>>(new Map());
  /** Cached [data-swatch] nodes — avoids querySelector on scroll/measure. */
  const swatchElsRef = useRef<Map<string, HTMLElement>>(new Map());
  const particlesRef = useRef<Particle[]>([]);
  const filterRef = useRef<Set<FlowPool>>(new Set());
  /** 0 = newest / list start (full fees), 1 = oldest / scrolled deep */
  const explorationRef = useRef(0);
  const stackedRef = useRef(false);
  const [exploration, setExploration] = useState(0);
  const speedRef = useRef<SpeedMult>(10);
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);
  const timeSecRef = useRef(0);
  const loadingMoreRef = useRef(false);
  /** Cached CSS size + DPR — ResizeObserver updates; draw remeasures only if drifted. */
  const layoutRef = useRef({ w: 0, h: 0, dpr: 1, ready: false });
  const pageVisibleRef = useRef(true);
  const scrollRafRef = useRef(0);
  /** Fingerprint of visible row ids — skip full resync when scroll doesn't change set. */
  const visibleKeyRef = useRef("");
  /** Offscreen pool bar (static between filter/size changes). */
  const barCacheRef = useRef<{
    canvas: HTMLCanvasElement | null;
    key: string;
  }>({ canvas: null, key: "" });
  const hoverRef = useRef<{
    pool: FlowPool | null;
    id: string | null;
    address: string | null;
  }>({ pool: null, id: null, address: null });
  const poolVolumeRef = useRef<Record<FlowPool, { in: bigint; out: bigint }>>({
    "0.1": { in: 0n, out: 0n },
    "1": { in: 0n, out: 0n },
    "10": { in: 0n, out: 0n },
    "100": { in: 0n, out: 0n },
  });

  const snap = useMemo(() => revive(snapshots[windowKey]), [snapshots, windowKey]);

  useEffect(() => {
    setListLimit(FLOW_LIST_PAGE);
  }, [windowKey]);

  const filterActive = filterPools.size > 0;

  const filteredDeposits = useMemo(() => {
    const all = [...snap.deposits].reverse();
    if (!filterActive) return all;
    return all.filter((d) => filterPools.has(d.pool));
  }, [snap.deposits, filterPools, filterActive]);

  const filteredWithdrawals = useMemo(() => {
    const all = [...snap.withdrawals].reverse();
    if (!filterActive) return all;
    return all.filter((w) => filterPools.has(w.pool));
  }, [snap.withdrawals, filterPools, filterActive]);

  const deposits = useMemo(
    () => filteredDeposits.slice(0, listLimit),
    [filteredDeposits, listLimit],
  );
  const withdrawals = useMemo(
    () => filteredWithdrawals.slice(0, listLimit),
    [filteredWithdrawals, listLimit],
  );

  const poolCounts = useMemo(() => {
    const m: Record<FlowPool, { in: number; out: number }> = {
      "0.1": { in: 0, out: 0 },
      "1": { in: 0, out: 0 },
      "10": { in: 0, out: 0 },
      "100": { in: 0, out: 0 },
    };
    for (const d of snap.deposits) m[d.pool].in += 1;
    for (const w of snap.withdrawals) m[w.pool].out += 1;
    return m;
  }, [snap]);

  const poolVolume = useMemo(() => {
    const m: Record<FlowPool, { in: bigint; out: bigint }> = {
      "0.1": { in: 0n, out: 0n },
      "1": { in: 0n, out: 0n },
      "10": { in: 0n, out: 0n },
      "100": { in: 0n, out: 0n },
    };
    for (const d of snap.deposits) m[d.pool].in += d.amountWei;
    for (const w of snap.withdrawals) m[w.pool].out += w.amountWei;
    return m;
  }, [snap]);

  useEffect(() => {
    poolVolumeRef.current = poolVolume;
    // Volume change can recolor filter segments on the pool bar
    barCacheRef.current.key = "";
  }, [poolVolume]);

  useEffect(() => {
    explorationRef.current = exploration;
  }, [exploration]);

  /** Map list scroll or hovered row → exploration depth 0..1 (newest→oldest). */
  const updateExploration = useCallback(
    (opts: { list?: HTMLUListElement; hoverIndex?: number | null }) => {
      const n = Math.max(1, filteredWithdrawals.length);
      if (opts.hoverIndex != null && opts.hoverIndex >= 0) {
        const d = Math.min(1, opts.hoverIndex / Math.max(1, n - 1));
        setExploration(d);
        explorationRef.current = d;
        return;
      }
      const list = opts.list;
      if (!list) return;
      const horizontal = list.scrollWidth > list.clientWidth + 2;
      const maxScroll = horizontal
        ? list.scrollWidth - list.clientWidth
        : list.scrollHeight - list.clientHeight;
      const pos = horizontal ? list.scrollLeft : list.scrollTop;
      const d = maxScroll <= 1 ? 0 : Math.min(1, Math.max(0, pos / maxScroll));
      setExploration(d);
      explorationRef.current = d;
    },
    [filteredWithdrawals.length],
  );

  const canLoadMore =
    (filteredDeposits.length > listLimit || filteredWithdrawals.length > listLimit) &&
    listLimit < FLOW_LIST_MAX;

  const loadMore = useCallback(() => {
    setListLimit((n) => {
      if (n >= FLOW_LIST_MAX) return n;
      return Math.min(FLOW_LIST_MAX, n + FLOW_LIST_PAGE);
    });
  }, []);

  const togglePool = (pool: FlowPool) => {
    setFilterPools((prev) => {
      const next = new Set(prev);
      if (next.has(pool)) next.delete(pool);
      else next.add(pool);
      return next;
    });
    setListLimit(FLOW_LIST_PAGE);
  };

  const clearFilters = () => {
    setFilterPools(new Set());
    setListLimit(FLOW_LIST_PAGE);
  };

  useEffect(() => {
    hoverRef.current = {
      pool: hoveredPool,
      id: hoveredId,
      address: hoveredAddress,
    };
  }, [hoveredPool, hoveredId, hoveredAddress]);

  useEffect(() => {
    filterRef.current = filterPools;
  }, [filterPools]);

  useEffect(() => {
    speedRef.current = speedMult;
  }, [speedMult]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(STACKED_MQ);
    const apply = () => {
      stackedRef.current = mq.matches;
      setStacked(mq.matches);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  /**
   * Build particles for rows visible in each list scrollport.
   * Anchor Y/size from the row’s colored swatch so departure/arrival lines up.
   */
  const syncParticles = useCallback(() => {
    const inList = inListRef.current;
    const outList = outListRef.current;
    const wrap = wrapRef.current;
    const canvasRect = wrap?.getBoundingClientRect() ?? null;
    // Soft nav / first paint: don't wipe live cubes while layout is still 0×0
    if (!wrap || !canvasRect || canvasRect.width < 2 || canvasRect.height < 2) {
      return;
    }
    // Rows not mounted yet — wait rather than clear
    if (
      rowElsRef.current.size === 0 &&
      (deposits.length > 0 || withdrawals.length > 0)
    ) {
      return;
    }

    const prevT = new Map(particlesRef.current.map((p) => [p.id, p.t]));

    type Cand = {
      eventId: string;
      pool: FlowPool;
      address: string;
      side: 0 | 1;
      seed: string;
    };

    const stackedLayout = stackedRef.current;
    /**
     * Safety cap if a list ever reports a huge “visible” set (layout thrash).
     * Normal scrollports (~15–22 rows) stay under this so every visible row fires.
     */
    const MAX_LIVE =
      typeof window !== "undefined" && window.matchMedia(STACKED_MQ).matches
        ? 24
        : 28;

    type AnchoredCand = Cand & { ax: number; ay: number; asize: number };

    const pickVisible = (
      rows: Array<{ id: string; pool: FlowPool; address: string }>,
      list: HTMLUListElement | null,
      side: 0 | 1,
      seedOf: (id: string) => string,
    ): AnchoredCand[] => {
      const all: AnchoredCand[] = [];
      if (!list) return all;
      const cw = canvasRect.width;
      const ch = canvasRect.height;
      // Measure list once per side (not per row)
      const listRect = list.getBoundingClientRect();

      // Strictly the list scrollport — never off-screen / below-the-fold rows.
      for (const row of rows) {
        const el = rowElsRef.current.get(row.id);
        if (!el) continue;
        if (!isVisibleInList(el, listRect)) continue;

        const flight = POOL_META[row.pool].particlePx;
        const m = measureSwatchAnchor(
          row.id,
          rowElsRef.current,
          swatchElsRef.current,
          canvasRect,
          side,
          -9999,
          -9999,
          flight,
        );
        if (!m.anchored) continue;
        // LR: Y band. Stacked: X band (rows sit above/below the canvas).
        if (stackedLayout) {
          if (m.x < -80 || m.x > cw + 80) continue;
        } else if (m.y < -40 || m.y > ch + 40) {
          continue;
        }

        all.push({
          eventId: row.id,
          pool: row.pool,
          address: row.address,
          side,
          seed: seedOf(row.id),
          ax: m.x,
          ay: m.y,
          asize: m.size,
        });
      }

      if (all.length <= MAX_LIVE) return all;

      // Rare: too many “visible” hits — keep spatial coverage, still viewport-only.
      all.sort((a, b) =>
        stackedLayout ? a.ax - b.ax || a.ay - b.ay : a.ay - b.ay || a.ax - b.ax,
      );
      const out: AnchoredCand[] = [];
      const used = new Set<number>();
      for (let i = 0; i < MAX_LIVE; i++) {
        let idx = Math.round((i * (all.length - 1)) / (MAX_LIVE - 1));
        while (used.has(idx) && idx < all.length - 1) idx += 1;
        while (used.has(idx) && idx > 0) idx -= 1;
        if (used.has(idx)) continue;
        used.add(idx);
        out.push(all[idx]);
      }
      return out;
    };

    const inRows = deposits.map((d) => ({
      id: d.id,
      pool: d.pool,
      address: d.from,
    }));
    const outRows = withdrawals.map((w) => ({
      id: w.id,
      pool: w.pool,
      address: w.to,
    }));

    const inCands = pickVisible(inRows, inList, 0, (id) => id);
    const outCands = pickVisible(outRows, outList, 1, (id) => id + "w");

    const next: Particle[] = [];

    const materialize = (
      cands: Array<Cand & { ax: number; ay: number; asize: number }>,
    ) => {
      const n = cands.length;
      cands.forEach((c, i) => {
        const h = hash01(c.seed);
        const h2 = hash01(c.seed + "j");
        // Wider scatter so cold start isn’t one dense wavefront
        const t0 = (i * 0.6180339887 * 1.7 + h * 1.31) % 1;
        const period = BASE_TRAVERSE_SEC * (0.85 + h * 0.55);
        const id = `${c.side === 0 ? "d" : "w"}-${c.eventId}`;
        const slot = n <= 1 ? 0.5 : i / (n - 1);
        const flight = POOL_META[c.pool].particlePx;

        // Reuse pick-time anchor — no second getBoundingClientRect pass
        next.push({
          id,
          eventId: c.eventId,
          pool: c.pool,
          address: c.address,
          addressLower: c.address.toLowerCase(),
          color:
            c.side === 0
              ? addressColor(c.address)
              : "rgba(210, 225, 240, 0.9)",
          side: c.side,
          slot,
          t: prevT.get(id) ?? t0,
          speed: 1 / period,
          phase: h * Math.PI * 2 + c.side * 1.7,
          pathJitter: h2,
          edge: flight,
          anchorX: c.ax,
          anchorY: c.ay,
          anchorSize: c.asize,
          anchored: true,
        });
      });
    };

    materialize(inCands);
    materialize(outCands);

    particlesRef.current = next;
    // Same fingerprint shape as scroll path (all visible ids, not just sampled)
    visibleKeyRef.current =
      visibleIdFingerprint(inRows, inList, rowElsRef.current) +
      "#" +
      visibleIdFingerprint(outRows, outList, rowElsRef.current);
  }, [deposits, withdrawals, stacked]);

  useLayoutEffect(() => {
    // Client nav remounts often land before lists have geometry — resync a few times.
    loadingMoreRef.current = false;
    lastTsRef.current = 0;
    let cancelled = false;
    const run = () => {
      if (!cancelled) syncParticles();
    };
    run();
    let id2 = 0;
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(run);
    });
    const timers = [50, 120, 300, 600, 1200].map((ms) =>
      window.setTimeout(run, ms),
    );
    return () => {
      cancelled = true;
      cancelAnimationFrame(id1);
      cancelAnimationFrame(id2);
      for (const t of timers) window.clearTimeout(t);
    };
  }, [syncParticles]);

  /** Re-measure swatch anchors without rebuilding the whole set (keeps t smooth). */
  const refreshAnchors = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const canvasRect = wrap.getBoundingClientRect();
    const ch = canvasRect.height;
    const cw = canvasRect.width;
    for (const p of particlesRef.current) {
      const fallbackX = cw * (0.07 + p.slot * 0.86);
      const fallbackY = ch * (0.07 + p.slot * 0.86);
      const m = measureSwatchAnchor(
        p.eventId,
        rowElsRef.current,
        swatchElsRef.current,
        canvasRect,
        p.side,
        fallbackX,
        fallbackY,
        p.edge,
      );
      p.anchorX = m.x;
      p.anchorY = m.y;
      p.anchorSize = m.size;
      p.anchored = m.anchored;
    }
  }, []);

  const onListScroll = useCallback(
    (e: UIEvent<HTMLUListElement>) => {
      const el = e.currentTarget;
      // Coalesce scroll work to one rAF — scroll can fire 50–100×/s
      if (scrollRafRef.current) return;
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = 0;
        // Always glue cubes to swatches while scrolling
        refreshAnchors();
        // Full rebuild only when the visible id set changes
        const inKey = visibleIdFingerprint(
          deposits.map((d) => ({ id: d.id })),
          inListRef.current,
          rowElsRef.current,
        );
        const outKey = visibleIdFingerprint(
          withdrawals.map((w) => ({ id: w.id })),
          outListRef.current,
          rowElsRef.current,
        );
        const key = `${inKey}#${outKey}`;
        if (key !== visibleKeyRef.current) {
          syncParticles();
        }
        updateExploration({ list: el });
        if (!canLoadMore || loadingMoreRef.current) return;
        const horizontal = el.scrollWidth > el.clientWidth + 2;
        const remaining = horizontal
          ? el.scrollWidth - el.scrollLeft - el.clientWidth
          : el.scrollHeight - el.scrollTop - el.clientHeight;
        if (remaining < 96) {
          loadingMoreRef.current = true;
          loadMore();
        }
      });
    },
    [
      refreshAnchors,
      syncParticles,
      updateExploration,
      canLoadMore,
      loadMore,
      deposits,
      withdrawals,
    ],
  );

  useEffect(() => {
    const wrap = wrapRef.current;
    const inList = inListRef.current;
    const outList = outListRef.current;
    if (!wrap) return;
    const measureLayout = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      // clientWidth/Height reflect the laid-out CSS box (not a stale inline size)
      const w = Math.max(1, Math.floor(wrap.clientWidth));
      const h = Math.max(1, Math.floor(wrap.clientHeight));
      const prev = layoutRef.current;
      layoutRef.current = { w, h, dpr, ready: w >= 2 && h >= 2 };
      if (prev.w !== w || prev.h !== h || prev.dpr !== dpr) {
        barCacheRef.current.key = "";
      }
      // Clear any leftover inline sizing from earlier builds
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.style.removeProperty("width");
        canvas.style.removeProperty("height");
      }
    };
    const onResize = () => {
      measureLayout();
      syncParticles();
      refreshAnchors();
    };
    measureLayout();
    const ro = new ResizeObserver(onResize);
    ro.observe(wrap);
    if (inList) ro.observe(inList);
    if (outList) ro.observe(outList);
    window.addEventListener("resize", onResize, { passive: true });
    // Settle anchors after soft nav / layout thrash, then always stop
    let ticks = 0;
    const iv = window.setInterval(() => {
      refreshAnchors();
      if (particlesRef.current.length === 0 && rowElsRef.current.size > 0) {
        syncParticles();
      }
      ticks += 1;
      // Always stop after ~3s — recovery is via ResizeObserver / pageshow
      if (ticks >= 6) {
        window.clearInterval(iv);
      }
    }, 500);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      window.clearInterval(iv);
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = 0;
      }
    };
  }, [syncParticles, refreshAnchors, deposits.length, withdrawals.length]);

  const setRowEl = useCallback((id: string, el: HTMLElement | null) => {
    if (el) {
      rowElsRef.current.set(id, el);
      swatchElsRef.current.set(
        id,
        el.querySelector<HTMLElement>("[data-swatch]") ?? el,
      );
    } else {
      rowElsRef.current.delete(id);
      swatchElsRef.current.delete(id);
    }
  }, []);

  const draw = useCallback(
    (ts: number) => {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      // Loop is owned by the effect — never self-schedule (soft-nav safe).
      if (!canvas || !wrap || !pageVisibleRef.current) return;

      // Prefer cached layout; remeasure only when missing or drifted (flex settle).
      let { w, h, dpr, ready } = layoutRef.current;
      const liveW = Math.max(1, Math.floor(wrap.clientWidth));
      const liveH = Math.max(1, Math.floor(wrap.clientHeight));
      if (!ready || Math.abs(w - liveW) > 1 || Math.abs(h - liveH) > 1) {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        w = liveW;
        h = liveH;
        if (w < 2 || h < 2) return;
        layoutRef.current = { w, h, dpr, ready: true };
      }
      if (w < 2 || h < 2) return;

      const pxW = Math.floor(w * dpr);
      const pxH = Math.floor(h * dpr);
      if (canvas.width !== pxW || canvas.height !== pxH) {
        canvas.width = pxW;
        canvas.height = pxH;
        // Do NOT set canvas.style width/height — CSS fills the wrap.
        ctxRef.current = canvas.getContext("2d", { alpha: true });
        if (ctxRef.current) {
          ctxRef.current.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        // Buffer size changed — invalidate bar bake
        barCacheRef.current.key = "";
      }

      let ctx = ctxRef.current;
      if (!ctx) {
        ctx = canvas.getContext("2d", { alpha: true });
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctxRef.current = ctx;
      }

      // Full clear each frame — no soft trail / hourglass smoke buildup
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, w, h);

      const dt =
        lastTsRef.current === 0 ? 0 : Math.min(0.05, (ts - lastTsRef.current) / 1000);
      lastTsRef.current = ts;
      timeSecRef.current += dt;
      const timeSec = timeSecRef.current;
      const mult = speedRef.current;

      const midX = w * 0.5;
      const midY = h * 0.5;
      const stackedLayout = stackedRef.current;
      // Desktop: tall vertical bar. Stacked mobile: wide horizontal belt.
      const barR = 4;
      let barW: number;
      let barH: number;
      let barX: number;
      let barY: number;
      if (stackedLayout) {
        barH = Math.max(16, Math.min(24, h * 0.06));
        barW = Math.max(72, Math.min(w * 0.52, w - 72));
        barX = (w - barW) / 2;
        barY = midY - barH / 2;
      } else {
        const topY = h * 0.04;
        const botY = h * 0.96;
        barW = Math.max(18, Math.min(28, w * 0.05));
        barH = botY - topY;
        barX = midX - barW / 2;
        barY = topY;
      }
      const barLeft = barX;
      const barRight = barX + barW;
      const barTop = barY;
      const barBot = barY + barH;
      const FADE_BEFORE = stackedLayout ? 8 : 14;
      const FADE_AFTER = stackedLayout ? 8 : 14;
      const zoneTop = barTop;
      const zoneBot = barBot;

      const focusPool = hoverRef.current.pool;
      const activeFilters = filterRef.current;
      const filterOn = activeFilters.size > 0;
      const vol = poolVolumeRef.current;
      const fleckPhase = Math.floor(timeSec * 8);

      // —— Pool bar: bake chip-dots offscreen; blit when static ——
      {
        const filterPoolsList = filterOn
          ? POOL_ORDER.filter((p) => activeFilters.has(p))
          : ([] as FlowPool[]);
        const filterKey = filterPoolsList.join(",");
        // Include segment volumes when filtered so bar re-bakes on data refresh
        const volKey =
          filterOn || focusPool
            ? POOL_ORDER.map((p) => `${vol[p].in}:${vol[p].out}`).join(",")
            : "";
        const barKey = [
          Math.round(barW),
          Math.round(barH),
          barR,
          stackedLayout ? "s" : "l",
          focusPool ?? "",
          filterKey,
          volKey,
          dpr,
        ].join("|");

        if (barCacheRef.current.key !== barKey || !barCacheRef.current.canvas) {
          const oc =
            barCacheRef.current.canvas ??
            (typeof document !== "undefined"
              ? document.createElement("canvas")
              : null);
          if (oc) {
            const bw = Math.max(1, Math.ceil(barW * dpr));
            const bh = Math.max(1, Math.ceil(barH * dpr));
            if (oc.width !== bw || oc.height !== bh) {
              oc.width = bw;
              oc.height = bh;
            }
            const octx = oc.getContext("2d");
            if (octx) {
              octx.setTransform(dpr, 0, 0, dpr, 0, 0);
              octx.clearRect(0, 0, barW, barH);
              octx.save();
              roundRectPath(octx, 0, 0, barW, barH, barR);
              octx.clip();

              if (filterOn || focusPool) {
                const pools = focusPool
                  ? ([focusPool] as FlowPool[])
                  : POOL_ORDER.filter((p) => activeFilters.has(p));
                let total = 0n;
                for (const p of pools) total += vol[p].in + vol[p].out;
                if (total > 0n) {
                  if (stackedLayout) {
                    let xCursor = 0;
                    for (const p of pools) {
                      const v = vol[p].in + vol[p].out;
                      const segW = barW * (Number(v) / Number(total));
                      paintChipDotPattern(
                        octx,
                        xCursor,
                        0,
                        segW + 0.5,
                        barH,
                        POOL_META[p].color,
                        0.42,
                      );
                      xCursor += segW;
                    }
                  } else {
                    let yCursor = 0;
                    for (const p of pools) {
                      const v = vol[p].in + vol[p].out;
                      const segH = barH * (Number(v) / Number(total));
                      paintChipDotPattern(
                        octx,
                        0,
                        yCursor,
                        barW,
                        segH + 0.5,
                        POOL_META[p].color,
                        0.42,
                      );
                      yCursor += segH;
                    }
                  }
                } else {
                  paintChipDotPattern(
                    octx,
                    0,
                    0,
                    barW,
                    barH,
                    focusPool
                      ? POOL_META[focusPool].color
                      : "rgba(10, 13, 18, 0.45)",
                    0.35,
                  );
                }
              } else {
                paintChipDotPattern(
                  octx,
                  0,
                  0,
                  barW,
                  barH,
                  "rgba(238, 247, 255, 0.12)",
                  0.22,
                );
              }
              octx.restore();
              barCacheRef.current = { canvas: oc, key: barKey };
            }
          }
        }

        const baked = barCacheRef.current.canvas;
        if (baked) {
          ctx.drawImage(baked, barX, barY, barW, barH);
        }
      }

      ctx.strokeStyle = "rgba(238, 247, 255, 0.14)";
      ctx.lineWidth = 1;
      roundRectPath(ctx, barX, barY, barW, barH, barR);
      ctx.stroke();

      ctx.save();
      ctx.translate(midX, midY);
      if (!stackedLayout) ctx.rotate(-Math.PI / 2);
      ctx.font = stackedLayout
        ? "600 11px ui-monospace, SFMono-Regular, Menlo, monospace"
        : "600 10px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillStyle =
        filterOn || focusPool
          ? "rgba(255,255,255,0.92)"
          : "rgba(238, 247, 255, 0.45)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(stackedLayout ? "POOL" : "P O O L", 0, 0);
      ctx.restore();

      // —— Cubes + flecks: one hourglassPath per particle per frame ——
      const hoverId = hoverRef.current.id;
      const hoverAddr = hoverRef.current.address?.toLowerCase() ?? null;
      let fleckI = 0;
      for (const p of particlesRef.current) {
        const inFilter = !filterOn || filterRef.current.has(p.pool);
        if (!inFilter) continue;

        const isDimmed =
          focusPool != null &&
          p.pool !== focusPool &&
          hoverId !== p.eventId;

        if (!reducedMotion && dt > 0) {
          p.t += p.speed * mult * dt;
          if (p.t >= 1) p.t -= 1;
        }

        const { x, y, size, glow, parentBlend, path, cycleFade } = sampleHourglass(
          p,
          w,
          h,
          timeSec,
          stackedLayout,
          reducedMotion,
        );

        // Spatial fade: gone before hitting the bar / born after leaving it
        let pinchFade = 1;
        if (stackedLayout) {
          if (p.side === 0) {
            const fadeEnd = zoneTop - FADE_BEFORE;
            const fadeStart = zoneTop - FADE_BEFORE - 22;
            if (y >= fadeEnd) pinchFade = 0;
            else if (y > fadeStart) pinchFade = 1 - (y - fadeStart) / (fadeEnd - fadeStart);
          } else {
            const fadeStart = zoneBot + FADE_AFTER;
            const fadeEnd = zoneBot + FADE_AFTER + 22;
            if (y <= fadeStart) pinchFade = 0;
            else if (y < fadeEnd) pinchFade = (y - fadeStart) / (fadeEnd - fadeStart);
          }
        } else if (p.side === 0) {
          const fadeEnd = barLeft - FADE_BEFORE;
          const fadeStart = barLeft - FADE_BEFORE - 22;
          if (x >= fadeEnd) pinchFade = 0;
          else if (x > fadeStart) pinchFade = 1 - (x - fadeStart) / (fadeEnd - fadeStart);
        } else {
          const fadeStart = barRight + FADE_AFTER;
          const fadeEnd = barRight + FADE_AFTER + 22;
          if (x <= fadeStart) pinchFade = 0;
          else if (x < fadeEnd) pinchFade = (x - fadeStart) / (fadeEnd - fadeStart);
        }
        pinchFade = Math.max(0, Math.min(1, pinchFade));

        const isOn =
          hoverId === p.eventId ||
          (hoverAddr != null && hoverAddr === p.addressLower) ||
          (focusPool != null && p.pool === focusPool);

        const baseAlpha = isDimmed
          ? 0.08
          : isOn
            ? 1
            : 0.5 + 0.35 * glow + 0.25 * parentBlend;
        const alpha = baseAlpha * pinchFade * cycleFade;

        // Pixel flecks use the same path as the cube (no second hourglassPath)
        if (
          !reducedMotion &&
          p.anchored &&
          !isDimmed &&
          pinchFade > 0.05
        ) {
          strokePixelPath(
            ctx,
            path,
            stackedLayout ? 0.14 : 0.12,
            fleckPhase + fleckI,
            travelEase(p.t, p.side),
          );
          fleckI += 1;
        }

        if (alpha < 0.02) continue;

        ctx.globalAlpha = alpha;
        const color = p.color;

        // Single short ghost
        if (!isDimmed && !reducedMotion && parentBlend < 0.55 && pinchFade > 0.2) {
          const tBack = Math.max(0, p.t - 0.04);
          const uu = travelEase(tBack, p.side);
          const gx = bez(uu, path.x0, path.cpx, path.x1);
          const gy = bez(uu, path.y0, path.cpy, path.y1);
          ctx.globalAlpha = alpha * 0.22;
          drawCube(ctx, gx, gy, size * 0.7, color);
          ctx.globalAlpha = alpha;
        }

        drawCube(ctx, x, y, size * (isOn ? 1.08 : 1), color, {
          glow: p.side === 1 && !isDimmed && isOn,
          glowStrength: isOn ? 0.55 : reducedMotion ? 0.18 : 0.26 * glow,
        });

        ctx.globalAlpha = 1;
      }
    },
    [reducedMotion],
  );

  const drawRef = useRef(draw);
  drawRef.current = draw;

  // Own the RAF loop in one place — draw never schedules itself.
  // Pause when the tab is hidden; reduced-motion draws once until interaction.
  useEffect(() => {
    let running = true;
    lastTsRef.current = 0;
    const reduced = () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const loop = (ts: number) => {
      if (!running) return;
      if (!pageVisibleRef.current) {
        rafRef.current = 0;
        return;
      }
      try {
        drawRef.current(ts);
      } catch (err) {
        // Keep the loop alive after a bad frame (layout thrash / canvas loss)
        console.error("[flow] draw frame failed:", err);
      }
      // Reduced motion: single paint, no continuous trail fade
      if (reduced()) {
        rafRef.current = 0;
        return;
      }
      if (running && pageVisibleRef.current) {
        rafRef.current = requestAnimationFrame(loop);
      }
    };

    const start = () => {
      if (!running) return;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      lastTsRef.current = 0;
      rafRef.current = requestAnimationFrame(loop);
    };

    const onVisibility = () => {
      pageVisibleRef.current = document.visibilityState === "visible";
      if (pageVisibleRef.current) start();
      else {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => start();

    pageVisibleRef.current = document.visibilityState === "visible";
    document.addEventListener("visibilitychange", onVisibility);
    mq.addEventListener("change", onMotion);
    start();

    return () => {
      running = false;
      document.removeEventListener("visibilitychange", onVisibility);
      mq.removeEventListener("change", onMotion);
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, []);

  // Soft nav / tab return: force particle rebuild when the page is shown again
  useEffect(() => {
    const resync = () => {
      lastTsRef.current = 0;
      loadingMoreRef.current = false;
      syncParticles();
      // one more pass after layout
      requestAnimationFrame(() => {
        requestAnimationFrame(() => syncParticles());
      });
    };
    const onVis = () => {
      if (document.visibilityState === "visible") resync();
    };
    window.addEventListener("pageshow", resync);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pageshow", resync);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [syncParticles]);

  // Reduced-motion: RAF stops after one frame; kick a repaint when data/UI changes
  useEffect(() => {
    if (!reducedMotion) return;
    const id = requestAnimationFrame((ts) => {
      lastTsRef.current = 0;
      drawRef.current(ts);
    });
    return () => cancelAnimationFrame(id);
  }, [
    reducedMotion,
    windowKey,
    deposits,
    withdrawals,
    filterPools,
    exploration,
    stacked,
  ]);

  const empty = snap.depositCount === 0 && snap.withdrawalCount === 0;
  const filteredEmpty = deposits.length === 0 && withdrawals.length === 0 && !empty;
  /** Subgraph error path returns indexing=true + empty + no block */
  const loadUncertain = empty && snap.indexing && snap.indexedBlock == null;

  const lightDeposit = (d: FlowDeposit, index: number) => {
    setHoveredId(d.id);
    setHoveredPool(null);
    setHoveredAddress(d.from);
    updateExploration({ hoverIndex: index });
  };
  const lightWithdrawal = (w: FlowWithdrawal, index: number) => {
    setHoveredId(w.id);
    setHoveredPool(null);
    setHoveredAddress(null);
    updateExploration({ hoverIndex: index });
  };
  const clearRow = () => {
    setHoveredId(null);
    setHoveredPool(null);
    setHoveredAddress(null);
    // Keep scroll-based exploration when hover ends
    const list = outListRef.current ?? inListRef.current;
    if (list) updateExploration({ list });
  };

  const inLabel = formatCount(snap.depositCount, snap.truncated);
  const outLabel = formatCount(snap.withdrawalCount, snap.truncated);
  const filteredInLabel = formatCount(filteredDeposits.length, false);
  const filteredOutLabel = formatCount(filteredWithdrawals.length, false);

  return (
    <div className="flow-panel">
      <div className="flow-toolbar">
        <div className="flow-toolbar-meta">
          <span
            className={`live-dot ${snap.indexing || empty ? "live-dot-off" : "live-dot-on"}`}
            aria-hidden="true"
          />
          <span
            title={
              snap.truncated
                ? "Tornado Cash only. Showing a sample of events for this window (fetch cap reached)."
                : "Tornado Cash ETH pools only (not the full quiet index)"
            }
          >
            Tornado Cash · {inLabel} deposits · {outLabel} withdrawals
            {snap.truncated ? " · sample" : ""}
          </span>
        </div>
        <div className="flow-toolbar-actions">
          <div className="range-toggle" role="group" aria-label="Time window">
            {FLOW_WINDOWS.map((w) => (
              <button
                key={w.key}
                type="button"
                className={`range-toggle-btn${windowKey === w.key ? " is-active" : ""}`}
                onClick={() => setWindowKey(w.key)}
              >
                {w.label}
              </button>
            ))}
          </div>
          <div className="range-toggle" role="group" aria-label="Animation speed">
            {SPEED_OPTIONS.map((s) => (
              <button
                key={s.key}
                type="button"
                className={`range-toggle-btn${speedMult === s.key ? " is-active" : ""}`}
                onClick={() => setSpeedMult(s.key)}
                title={
                  s.key === 1
                    ? `~${BASE_TRAVERSE_SEC}s per traverse`
                    : `${s.key}× (~${(BASE_TRAVERSE_SEC / s.key).toFixed(1)}s)`
                }
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flow-chrome">
        <div className="flow-stats">
          <p className="flow-stat">
            <span className="flow-stat-value">{formatEthWei(snap.inWei, 1)}</span>
            <span className="flow-stat-label">deposited</span>
          </p>
          <p className="flow-stat">
            <span className="flow-stat-value">{formatEthWei(snap.outWei, 1)}</span>
            <span className="flow-stat-label">withdrawn</span>
          </p>
          <p className="flow-stat flow-stat-fee" title="Relayer fees in this window">
            <span className="flow-stat-value flow-stat-fee-value">
              {formatEthWei(snap.feeWei, 2)}
            </span>
            <span className="flow-stat-label">
              <span className="flow-fee-swatch" aria-hidden="true" />
              relayer fees
            </span>
          </p>
        </div>

        <div className="flow-pool-chips" role="group" aria-label="Filter by pool size">
          {POOL_ORDER.map((pool) => {
            const c = poolCounts[pool];
            const selected = filterPools.has(pool);
            const dimmed = filterActive && !selected;
            const hot = hoveredPool === pool;
            return (
              <button
                key={pool}
                type="button"
                className={`flow-chip${selected || hot ? " is-on" : ""}${dimmed ? " is-dim" : ""}`}
                style={{ ["--seg-color" as string]: POOL_CHIP_COLORS[pool] }}
                aria-pressed={selected}
                title={`Show only ${POOL_META[pool].label} deposits and withdrawals (${c.in} in, ${c.out} out)`}
                onClick={() => togglePool(pool)}
                onPointerEnter={() => setHoveredPool(pool)}
                onPointerLeave={() => setHoveredPool(null)}
              >
                <span className="flow-chip-label">{pool}</span>
                <span className="flow-chip-count" aria-hidden="true">
                  {c.in}→{c.out}
                </span>
              </button>
            );
          })}
          {filterActive && (
            <button
              type="button"
              className="flow-chip-clear"
              onClick={clearFilters}
              title="Clear pool filter and show every size"
            >
              show all
            </button>
          )}
        </div>
      </div>

      <div className="flow-body">
        <div className="flow-col flow-col-in">
          <div className="flow-list-head">
            <span>
              {deposits.length}
              {filteredDeposits.length > deposits.length
                ? ` / ${filteredInLabel}`
                : snap.depositCount > deposits.length
                  ? ` / ${inLabel}`
                  : ""}{" "}
              deposits
            </span>
          </div>
          <div className="flow-list-frame">
            <ul
              className="flow-list flow-list-in"
              ref={inListRef}
              aria-label="Tornado deposits"
              onScroll={onListScroll}
            >
              {deposits.map((d, index) => {
                const color = addressColor(d.from);
                const on =
                  hoveredId === d.id ||
                  (hoveredAddress != null &&
                    hoveredAddress.toLowerCase() === d.from.toLowerCase());
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      className={`flow-row flow-row-input${on ? " is-on" : ""}`}
                      data-pool={d.pool}
                      style={{ ["--seg-color" as string]: color }}
                      ref={(el) => setRowEl(d.id, el)}
                      onPointerEnter={() => lightDeposit(d, index)}
                      onPointerLeave={clearRow}
                    >
                      <span className="flow-row-addr">{shortAddr(d.from)}</span>
                      <span className="flow-row-amt">{POOL_META[d.pool].label}</span>
                      <span
                        className="flow-row-swatch"
                        data-swatch
                        style={{ background: color }}
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                );
              })}
              {deposits.length === 0 && (
                <li className="flow-list-empty">
                  {filteredEmpty
                    ? "No deposits for this pool size"
                    : "No deposits in this window"}
                </li>
              )}
              {canLoadMore && (
                <li className="flow-list-more">scroll for more</li>
              )}
            </ul>
            <div className="flow-list-fade flow-list-fade-top" aria-hidden="true" />
            <div className="flow-list-fade flow-list-fade-bot" aria-hidden="true" />
          </div>
        </div>

        <div className="flow-canvas-wrap" ref={wrapRef}>
          <canvas ref={canvasRef} className="flow-canvas" aria-hidden="true" />
          <p className="flow-canvas-sr-note">
            Decorative animation of pool activity. Cubes are not a mapping from
            a real deposit to a real withdrawal.
          </p>
          {empty && (
            <div className="flow-empty" role="status">
              {loadUncertain ? (
                <>
                  <p className="flow-empty-title">No events loaded</p>
                  <p className="flow-empty-body">
                    The feed may still be indexing, or it is temporarily down.
                    Pick 7d above, or refresh in a minute.
                  </p>
                </>
              ) : snap.indexing ? (
                <>
                  <p className="flow-empty-title">Still indexing</p>
                  <p className="flow-empty-body">
                    Tornado events are catching up
                    {snap.indexedBlock != null
                      ? ` (block ${snap.indexedBlock.toLocaleString()})`
                      : ""}
                    . The lists will fill when ready.
                  </p>
                </>
              ) : (
                <>
                  <p className="flow-empty-title">No activity in this window</p>
                  <p className="flow-empty-body">
                    Try 7d, or clear a pool filter if one is active.
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flow-col flow-col-out">
          <div className="flow-list-head">
            <span>
              {withdrawals.length}
              {filteredWithdrawals.length > withdrawals.length
                ? ` / ${filteredOutLabel}`
                : snap.withdrawalCount > withdrawals.length
                  ? ` / ${outLabel}`
                  : ""}{" "}
              withdrawals
            </span>
          </div>
          <div className="flow-list-frame">
            <ul
              className="flow-list flow-list-out"
              ref={outListRef}
              aria-label="Tornado withdrawals"
              onScroll={onListScroll}
            >
              {withdrawals.map((w, index) => {
                const on = hoveredId === w.id;
                return (
                  <li key={w.id}>
                    <button
                      type="button"
                      className={`flow-row flow-row-out${on ? " is-on" : ""}`}
                      data-pool={w.pool}
                      style={{ ["--seg-color" as string]: OUT_ROW_HOVER }}
                      ref={(el) => setRowEl(w.id, el)}
                      onPointerEnter={() => lightWithdrawal(w, index)}
                      onPointerLeave={clearRow}
                    >
                      <span
                        className="flow-row-swatch"
                        data-swatch
                        style={{
                          background: on
                            ? "rgba(238, 247, 255, 0.78)"
                            : "rgba(238, 247, 255, 0.16)",
                        }}
                        aria-hidden="true"
                      />
                      <span className="flow-row-amt">{POOL_META[w.pool].label}</span>
                      <span className="flow-row-addr">{shortAddr(w.to)}</span>
                    </button>
                  </li>
                );
              })}
              {withdrawals.length === 0 && (
                <li className="flow-list-empty">
                  {filteredEmpty
                    ? "No withdrawals for this pool size"
                    : "No withdrawals in this window"}
                </li>
              )}
              {canLoadMore && (
                <li className="flow-list-more">scroll for more</li>
              )}
            </ul>
            <div className="flow-list-fade flow-list-fade-top" aria-hidden="true" />
            <div className="flow-list-fade flow-list-fade-bot" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  // Guard: fee-rail / clip bands can briefly go non-positive during layout
  if (!(w > 0) || !(h > 0)) {
    ctx.beginPath();
    return;
  }
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export default memo(FlowViz);
