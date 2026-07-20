"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type UIEvent,
} from "react";
import {
  FLOW_LIST_PAGE,
  FLOW_WINDOWS,
  OUT_ROW_HOVER,
  POOL_CHIP_COLORS,
  POOL_META,
  POOL_ORDER,
  addressColorPaperTeal,
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
import {
  POOL_SIDE,
  packItems,
  type PlacedBlock,
} from "@/lib/flow-grid-pack";
import type { SerializableSnapshot } from "./FlowGridStage";

type Props = {
  snapshots: Record<FlowWindow, SerializableSnapshot>;
};

/** Match FlowViz speed params. */
const BASE_TRAVERSE_SEC = 8;
const SPEED_OPTIONS = [
  { key: 1, label: "1×" },
  { key: 2, label: "2×" },
  { key: 5, label: "5×" },
  { key: 10, label: "10×" },
] as const;
type SpeedMult = (typeof SPEED_OPTIONS)[number]["key"];

const APPROACH_END = 0.5;
const SLOT_START = 0.56;
const FADE_OUT = 0.28;
const FADE_IN = 0.22;
/** Base columns for sparse windows; dense 7d packs use more cols (see packColsFor). */
const GRID_COLS_MIN = 16;
const GRID_COLS_MAX = 40;
const MAX_LIVE = 48;
/** Never thinner than this — 7d was collapsing to a hairline. */
const MIN_BAR_W = 100;

/** More deposits → more columns so rows stay shorter and cells stay readable. */
function packColsFor(depositCount: number): number {
  if (depositCount <= 250) return GRID_COLS_MIN;
  if (depositCount <= 800) return 24;
  if (depositCount <= 2000) return 32;
  return GRID_COLS_MAX;
}
const OUT_COLOR = "rgba(210, 225, 240, 0.9)";

type FlyPhase = "approach" | "void" | "slot";

/** Continuous particle (like FlowViz) — loops t, anchored to a list row. */
type Particle = {
  id: string;
  eventId: string;
  side: 0 | 1;
  pool: FlowPool;
  address: string;
  color: string;
  /** Flight cube size = row swatch / POOL_META.particlePx */
  edge: number;
  t: number;
  speed: number;
  jitter: number;
  anchorX: number;
  anchorY: number;
  anchorSize: number;
  /** Pack cell for deposits (square mosaic). */
  col: number;
  row: number;
  cells: number;
  /** First cycle stamped into bake. */
  landedOnce: boolean;
  /**
   * fill = one-shot pack entry (left edge → slot), removed after land.
   * row = continuous list-anchored flight (slot only if not yet in mosaic).
   */
  kind: "fill" | "row";
};

/** One-shot fill flights for progressive pack reveal. */
type FillFlight = {
  eventId: string;
  color: string;
  edge: number;
  t: number;
  speed: number;
  jitter: number;
  x0: number;
  y0: number;
  col: number;
  row: number;
  cells: number;
};

type Layout = {
  w: number;
  h: number;
  dpr: number;
  barLeft: number;
  barTop: number;
  barBot: number;
  barW: number;
  /** Cell size in CSS px (may differ when the pack is dense) */
  cellX: number;
  cellY: number;
  cols: number;
  rows: number;
  /** Mosaic origin (top-left) — fills the bar shell */
  mosaicX: number;
  mosaicY: number;
  mosaicW: number;
  mosaicH: number;
};

function revive(s: SerializableSnapshot): FlowSnapshot {
  return {
    window: s.window,
    since: s.since,
    deposits: (s.deposits ?? []).map((d) => ({
      ...d,
      amountWei: safeBigInt(d.amountWei),
      from: d.from || "0x",
      pool: d.pool,
    })),
    withdrawals: (s.withdrawals ?? []).map((w) => ({
      ...w,
      amountWei: safeBigInt(w.amountWei),
      feeWei: safeBigInt(w.feeWei),
      to: w.to || "0x",
      pool: w.pool,
    })),
    inWei: safeBigInt(s.inWei),
    outWei: safeBigInt(s.outWei),
    feeWei: safeBigInt(s.feeWei),
    depositCount: s.depositCount ?? 0,
    withdrawalCount: s.withdrawalCount ?? 0,
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

function bez(t: number, a: number, b: number, c: number): number {
  const o = 1 - t;
  return o * o * a + 2 * o * t * b + t * t * c;
}

function travelEase(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 2.4);
}

function easeInOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function morph(t: number, from: number, to: number): number {
  const start = 0.04;
  if (t <= start) return from;
  const k = Math.min(1, (t - start) / (1 - start));
  const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  return from + (to - from) * e;
}

function cellRect(p: Particle, L: Layout) {
  const w = p.cells * L.cellX;
  const h = p.cells * L.cellY;
  // row 0 = bottom of mosaic
  const x = L.mosaicX + p.col * L.cellX;
  const y = L.mosaicY + L.mosaicH - (p.row + p.cells) * L.cellY;
  // Flight target size = min side so cubes stay roughly square in motion
  const s = Math.max(2, Math.min(w, h));
  return { x: x + w / 2, y: y + h / 2, s, w, h };
}

/**
 * Deposit flight:
 *  - first cycle: approach → dissolve → resurface → slot once
 *  - after landed: approach → dissolve only (never re-slot the same cell)
 */
function sampleIn(p: Particle, L: Layout, tRaw: number) {
  const t = ((tRaw % 1) + 1) % 1;
  const midY = (L.barTop + L.barBot) * 0.5;
  const barH = Math.max(1, L.barBot - L.barTop);
  const jY = (p.jitter - 0.5) * barH * 0.1;
  const cell = cellRect(p, L);
  const target = cell.s;

  const vanishX = L.barLeft - (14 + p.jitter * 18);
  const vanishY = midY + jY * 0.5 + (p.anchorY - midY) * 0.15;
  const padX = Math.min(8, L.barW * 0.08);
  const rsX = Math.min(
    Math.max(L.barLeft + padX, L.barLeft + L.barW * 0.3 + p.jitter * L.barW * 0.15),
    L.barLeft + L.barW - padX,
  );
  const rsY = midY + jY * 0.35;
  const from = Math.max(3, p.anchorSize || p.edge);

  // After first land (or fill already stamped): approach → dissolve only
  if (p.landedOnce) {
    const u = travelEase(t);
    const cpx = p.anchorX * 0.3 + vanishX * 0.5 + L.w * 0.08;
    const cpy = midY + (p.jitter - 0.5) * L.h * 0.12;
    const x = bez(u, p.anchorX, cpx, vanishX);
    const y = bez(u, p.anchorY, cpy, vanishY);
    let alpha = 1;
    if (u < 0.06) alpha = easeInOutCubic(u / 0.06);
    else if (u > 1 - FADE_OUT) {
      alpha = 1 - easeInOutCubic((u - (1 - FADE_OUT)) / FADE_OUT);
    }
    const size = morph(u * 0.35, from, from * 1.1);
    return { x, y, size, alpha, phase: "approach" as FlyPhase };
  }

  let x = p.anchorX;
  let y = p.anchorY;
  let sizeT = 0;
  let alpha = 1;
  let phase: FlyPhase = "void";

  if (t < APPROACH_END) {
    phase = "approach";
    const u = travelEase(t / APPROACH_END);
    const cpx = p.anchorX * 0.3 + vanishX * 0.5 + L.w * 0.08;
    const cpy = midY + (p.jitter - 0.5) * L.h * 0.12;
    x = bez(u, p.anchorX, cpx, vanishX);
    y = bez(u, p.anchorY, cpy, vanishY);
    sizeT = u * 0.15;
    const fadeStart = 1 - FADE_OUT;
    if (u > fadeStart) {
      const fv = (u - fadeStart) / FADE_OUT;
      alpha = 1 - easeInOutCubic(fv);
      sizeT *= 1 - 0.45 * fv;
    }
  } else if (t < SLOT_START) {
    phase = "void";
    x = rsX;
    y = rsY;
    sizeT = 0.15;
    alpha = 0;
  } else {
    phase = "slot";
    const u = easeInOutCubic((t - SLOT_START) / (1 - SLOT_START));
    const cpx = rsX * 0.4 + cell.x * 0.6;
    const cpy = rsY * 0.45 + cell.y * 0.55;
    x = bez(u, rsX, cpx, cell.x);
    y = bez(u, rsY, cpy, cell.y);
    sizeT = 0.15 + 0.85 * u;
    if (u < FADE_IN) {
      const fi = u / FADE_IN;
      alpha = easeInOutCubic(fi);
      sizeT = 0.1 + sizeT * (0.35 + 0.65 * fi);
    }
  }

  const size = morph(Math.max(0, sizeT), from, Math.max(from, target));
  return { x, y, size, alpha, phase };
}

/** One-shot fill: left edge → dissolve → slot into pack cell (no list anchor). */
function sampleFill(
  f: FillFlight,
  L: Layout,
  tRaw: number,
): { x: number; y: number; size: number; alpha: number; phase: FlyPhase } {
  const t = Math.min(1, Math.max(0, tRaw));
  const midY = (L.barTop + L.barBot) * 0.5;
  const barH = Math.max(1, L.barBot - L.barTop);
  const jY = (f.jitter - 0.5) * barH * 0.1;
  const bw = f.cells * L.cellX;
  const bh = f.cells * L.cellY;
  const s = Math.max(2, Math.min(bw, bh));
  const cx = L.mosaicX + f.col * L.cellX + bw / 2;
  const cy = L.mosaicY + L.mosaicH - (f.row + f.cells) * L.cellY + bh / 2;

  const vanishX = L.barLeft - (14 + f.jitter * 18);
  const vanishY = midY + jY * 0.5 + (f.y0 - midY) * 0.2;
  const padX = Math.min(8, L.barW * 0.08);
  const rsX = Math.min(
    Math.max(L.barLeft + padX, L.barLeft + L.barW * 0.28 + f.jitter * 0.2 * L.barW),
    L.barLeft + L.barW - padX,
  );
  const rsY = midY + jY * 0.35;
  const from = Math.max(3, f.edge);

  let x = f.x0;
  let y = f.y0;
  let sizeT = 0;
  let alpha = 1;
  let phase: FlyPhase = "void";

  if (t < APPROACH_END) {
    phase = "approach";
    const u = travelEase(t / APPROACH_END);
    const cpx = f.x0 * 0.3 + vanishX * 0.5 + L.w * 0.08;
    const cpy = midY + (f.jitter - 0.5) * L.h * 0.12;
    x = bez(u, f.x0, cpx, vanishX);
    y = bez(u, f.y0, cpy, vanishY);
    sizeT = u * 0.2;
    if (u > 1 - FADE_OUT) {
      const fv = (u - (1 - FADE_OUT)) / FADE_OUT;
      alpha = 1 - easeInOutCubic(fv);
      sizeT *= 1 - 0.45 * fv;
    }
  } else if (t < SLOT_START) {
    phase = "void";
    x = rsX;
    y = rsY;
    sizeT = 0.15;
    alpha = 0;
  } else {
    phase = "slot";
    const u = easeInOutCubic((t - SLOT_START) / (1 - SLOT_START));
    const cpx = rsX * 0.4 + cx * 0.6;
    const cpy = rsY * 0.45 + cy * 0.55;
    x = bez(u, rsX, cpx, cx);
    y = bez(u, rsY, cpy, cy);
    sizeT = 0.15 + 0.85 * u;
    if (u < FADE_IN) {
      const fi = u / FADE_IN;
      alpha = easeInOutCubic(fi);
      sizeT = 0.1 + sizeT * (0.35 + 0.65 * fi);
    }
  }

  return {
    x,
    y,
    size: morph(Math.max(0, sizeT), from, Math.max(from, s)),
    alpha,
    phase,
  };
}

/**
 * Withdrawal: pool *right edge* (outside) → hourglass to list swatch.
 * No unslot / no cubes moving inside the bar.
 */
function sampleOut(p: Particle, L: Layout, tRaw: number) {
  const t = ((tRaw % 1) + 1) % 1;
  const midY = (L.barTop + L.barBot) * 0.5;
  const jY = (p.jitter - 0.5) * Math.max(1, L.barBot - L.barTop) * 0.12;

  // Birth just outside the bar's right edge — never inside mosaic
  const x0 = L.barLeft + L.barW + 6 + p.jitter * 8;
  const y0 = midY + jY;
  const x1 = p.anchorX;
  const y1 = p.anchorY;

  const u = travelEase(t);
  const cpx = x0 * 0.35 + x1 * 0.45 + L.w * 0.12;
  const cpy = midY + (p.jitter - 0.5) * L.h * 0.14;
  const x = bez(u, x0, cpx, x1);
  const y = bez(u, y0, cpy, y1);

  // Size: pool particle → match output swatch near arrival
  const from = POOL_META[p.pool].particlePx;
  const to = Math.max(from, p.anchorSize || from);
  // Soft birth/death so continuous loop doesn't pop
  let alpha = 1;
  if (t < 0.08) alpha = easeInOutCubic(t / 0.08);
  else if (t > 0.9) alpha = 1 - easeInOutCubic((t - 0.9) / 0.1);

  const size = morph(u, from, to);
  return { x, y, size, alpha, phase: "approach" as FlyPhase };
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
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

function paintChipDots(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  dotA: number,
) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = `rgba(255,255,255,${dotA})`;
  for (let yy = Math.floor(y); yy < y + h; yy += 3) {
    for (let xx = Math.floor(x); xx < x + w; xx += 3) {
      ctx.fillRect(xx + 1, yy + 1, 1, 1);
    }
  }
}

function drawCube(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
  a: number,
) {
  ctx.globalAlpha = a;
  ctx.fillStyle = color;
  const s = Math.max(1, size);
  if (s <= 1.4) {
    ctx.fillRect(Math.floor(x - s / 2), Math.floor(y - s / 2), Math.round(s), Math.round(s));
  } else {
    const rx = Math.min(1.5, s * 0.14);
    roundRectPath(ctx, x - s / 2, y - s / 2, s, s, rx);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function isVisibleInList(el: HTMLElement, listRect: DOMRect): boolean {
  const er = el.getBoundingClientRect();
  if (er.width < 1 && er.height < 1) return false;
  return (
    er.bottom > listRect.top &&
    er.top < listRect.bottom &&
    er.right > listRect.left &&
    er.left < listRect.right
  );
}

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function getReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function FlowPoolGrid({ snapshots }: Props) {
  const [windowKey, setWindowKey] = useState<FlowWindow>("24h");
  const [speedMult, setSpeedMult] = useState<SpeedMult>(10);
  const [filterPools, setFilterPools] = useState<Set<FlowPool>>(() => new Set());
  const [listLimit, setListLimit] = useState(FLOW_LIST_PAGE);
  const [hoveredPool, setHoveredPool] = useState<FlowPool | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoveredAddress, setHoveredAddress] = useState<string | null>(null);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    () => false,
  );


  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inListRef = useRef<HTMLUListElement | null>(null);
  const outListRef = useRef<HTMLUListElement | null>(null);
  const rowElsRef = useRef<Map<string, HTMLElement>>(new Map());
  const swatchElsRef = useRef<Map<string, HTMLElement>>(new Map());
  const layoutRef = useRef<Layout | null>(null);
  const speedRef = useRef<SpeedMult>(10);
  const windowKeyRef = useRef<FlowWindow>("24h");
  const reducedRef = useRef(false);
  const particlesRef = useRef<Particle[]>([]);
  const packByIdRef = useRef<Map<string, PlacedBlock>>(new Map());
  /** Newest-first ids for the full pack (not just the paginated list page). */
  const packOrderRef = useRef<string[]>([]);
  const packRowsRef = useRef(1);
  const packColsRef = useRef(GRID_COLS_MIN);
  const inLandedRef = useRef<Set<string>>(new Set());
  /** Progressive fill queue (eventIds not yet stamped). */
  const fillQueueRef = useRef<string[]>([]);
  const fillFlightsRef = useRef<FillFlight[]>([]);
  const fillAccRef = useRef(0);
  /** Persist phase across scroll/visibility so anim never rewinds. */
  const phaseRef = useRef<Map<string, { t: number; landedOnce: boolean }>>(new Map());
  const lastTsRef = useRef(0);
  const rafRef = useRef(0);
  const bakeDirtyRef = useRef(true);
  const animStartedRef = useRef(false);
  const depositsRef = useRef<FlowDeposit[]>([]);
  const withdrawalsRef = useRef<FlowWithdrawal[]>([]);
  const needSyncRef = useRef(true);
  /** Accelerated history fill-up on land; ends when complete or user scrolls deposits. */
  const introActiveRef = useRef(true);
  const userScrolledDepositsRef = useRef(false);
  /** Deposit-list scroll kinematics → fill/empty rate (px/s, smoothed). */
  const scrollKinRef = useRef({
    lastTop: 0,
    lastTs: 0,
    vel: 0,
    unlandAcc: 0,
  });
  const bakeRef = useRef<{
    canvas: HTMLCanvasElement | null;
    ctx: CanvasRenderingContext2D | null;
    w: number;
    h: number;
  }>({ canvas: null, ctx: null, w: 0, h: 0 });

  const snap = useMemo(() => revive(snapshots[windowKey]), [snapshots, windowKey]);

  const setWindow = (key: FlowWindow) => {
    setWindowKey(key);
    setListLimit(FLOW_LIST_PAGE);
  };

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

  /** Full series — no client pack cap; accuracy matches the window fetch. */
  const packDeposits = filteredDeposits;

  useEffect(() => {
    depositsRef.current = deposits;
    withdrawalsRef.current = withdrawals;
  }, [deposits, withdrawals]);

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

  const packed = useMemo(() => {
    const inItems = packDeposits.map((d, i) => ({
      id: d.id,
      pool: d.pool,
      address: d.from,
      color: addressColorPaperTeal(d.from, "landed"),
      side: POOL_SIDE[d.pool],
      flight: POOL_META[d.pool].particlePx,
      inputOrder: i,
    }));
    const cols = packColsFor(inItems.length);
    const seed = `${windowKey}|${[...filterPools].sort().join(",")}|${inItems.length}|c${cols}`;
    return packItems(inItems, cols, seed);
  }, [packDeposits, windowKey, filterPools]);

  useEffect(() => {
    speedRef.current = speedMult;
  }, [speedMult]);
  useEffect(() => {
    windowKeyRef.current = windowKey;
  }, [windowKey]);
  useEffect(() => {
    reducedRef.current = reducedMotion;
  }, [reducedMotion]);

  // Pack plan → empty mosaic + intro time-lapse. After intro, scroll drives fill.
  useEffect(() => {
    const map = new Map<string, PlacedBlock>();
    for (const p of packed.placed) map.set(p.id, p);
    packByIdRef.current = map;
    // Newest-first order from pack input (matches list / packDeposits order)
    packOrderRef.current = [...packed.placed]
      .sort((a, b) => a.inputOrder - b.inputOrder)
      .map((p) => p.id);
    packRowsRef.current = Math.max(1, packed.rows);
    packColsRef.current = Math.max(GRID_COLS_MIN, packed.cols);
    inLandedRef.current = new Set();
    fillQueueRef.current = [];
    fillFlightsRef.current = [];
    fillAccRef.current = 0;
    phaseRef.current = new Map();
    particlesRef.current = [];
    bakeDirtyRef.current = true;
    needSyncRef.current = true;
    introActiveRef.current = true;
    userScrolledDepositsRef.current = false;
    scrollKinRef.current = { lastTop: 0, lastTs: 0, vel: 0, unlandAcc: 0 };
  }, [packed]);

  const canLoadMore =
    filteredDeposits.length > listLimit || filteredWithdrawals.length > listLimit;

  const loadMore = useCallback(() => {
    setListLimit((n) => n + FLOW_LIST_PAGE);
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

  const setRowEl = useCallback((id: string, el: HTMLElement | null) => {
    if (el) rowElsRef.current.set(id, el);
    else {
      rowElsRef.current.delete(id);
      swatchElsRef.current.delete(id);
    }
  }, []);

  // —— Canvas: continuous flow + square mosaic ——
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    if (animStartedRef.current) return;
    animStartedRef.current = true;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const measureSwatch = (
      eventId: string,
      canvasRect: DOMRect,
    ): { x: number; y: number; size: number } | null => {
      let sw = swatchElsRef.current.get(eventId);
      if (!sw) {
        const row = rowElsRef.current.get(eventId);
        if (!row) return null;
        sw = row.querySelector<HTMLElement>("[data-swatch]") ?? row;
        swatchElsRef.current.set(eventId, sw);
      }
      const r = sw.getBoundingClientRect();
      if (r.width < 1 && r.height < 1) return null;
      return {
        x: r.left + r.width / 2 - canvasRect.left,
        y: r.top + r.height / 2 - canvasRect.top,
        size: Math.max(3, Math.min(16, Math.min(r.width, r.height) * 0.92)),
      };
    };

    /** Write live t/landed into phaseRef so scroll never loses progress. */
    const persistPhases = () => {
      for (const p of particlesRef.current) {
        phaseRef.current.set(p.id, { t: p.t, landedOnce: p.landedOnce });
      }
    };

    /**
     * Rebuild live set from visible rows. Phase comes from phaseRef (or
     * previous particle) — never rewinds t on scroll.
     */
    const syncParticles = (L: Layout) => {
      persistPhases();
      const canvasRect = canvas.getBoundingClientRect();
      const next: Particle[] = [];

      const pushVisible = (
        rows: Array<{ id: string; pool: FlowPool; address: string }>,
        list: HTMLUListElement | null,
        side: 0 | 1,
      ) => {
        if (!list) return;
        const listRect = list.getBoundingClientRect();
        const cands: typeof rows = [];
        for (const row of rows) {
          const el = rowElsRef.current.get(row.id);
          if (el && isVisibleInList(el, listRect)) cands.push(row);
        }
        let picked = cands;
        if (picked.length > MAX_LIVE / 2) {
          const step = picked.length / (MAX_LIVE / 2);
          picked = [];
          for (let i = 0; i < MAX_LIVE / 2; i++) {
            picked.push(cands[Math.min(cands.length - 1, Math.floor(i * step))]);
          }
        }
        for (let i = 0; i < picked.length; i++) {
          const row = picked[i];
          const m = measureSwatch(row.id, canvasRect);
          if (!m) continue;
          const id = `${side === 0 ? "d" : "w"}-${row.id}`;
          const h = hash01(id);
          const pack = side === 0 ? packByIdRef.current.get(row.id) : undefined;
          const cells = pack?.side ?? POOL_SIDE[row.pool];
          const col =
            pack?.col ??
            Math.floor(h * Math.max(1, packColsRef.current - cells));
          const rowN =
            pack?.row ??
            Math.floor(hash01(id + "r") * Math.max(1, packRowsRef.current - cells));
          const period = BASE_TRAVERSE_SEC * (0.85 + h * 0.55);
          const saved = phaseRef.current.get(id);
          const t0 =
            saved?.t ??
            (i * 0.6180339887 * 1.7 + h * 1.31) % 1;
          // Already in mosaic (fill or prior slot) → ambient only, no re-slot
          const landedOnce =
            side === 0
              ? (saved?.landedOnce ?? inLandedRef.current.has(row.id))
              : (saved?.landedOnce ?? false);
          next.push({
            id,
            eventId: row.id,
            side,
            pool: row.pool,
            address: row.address,
            color:
              side === 0
                ? addressColorPaperTeal(row.address, "flight")
                : OUT_COLOR,
            edge: POOL_META[row.pool].particlePx,
            t: t0,
            speed: 1 / period,
            jitter: hash01(id + "j"),
            anchorX: m.x,
            anchorY: m.y,
            anchorSize: m.size,
            col,
            row: rowN,
            cells,
            landedOnce,
            kind: "row",
          });
        }
      };

      pushVisible(
        depositsRef.current.map((d) => ({ id: d.id, pool: d.pool, address: d.from })),
        inListRef.current,
        0,
      );
      pushVisible(
        withdrawalsRef.current.map((w) => ({ id: w.id, pool: w.pool, address: w.to })),
        outListRef.current,
        1,
      );
      particlesRef.current = next;
      void L;
    };

    /** Update swatch anchors only — keep t / landedOnce untouched. */
    const reanchorParticles = () => {
      const canvasRect = canvas.getBoundingClientRect();
      for (const p of particlesRef.current) {
        const m = measureSwatch(p.eventId, canvasRect);
        if (!m) continue;
        p.anchorX = m.x;
        p.anchorY = m.y;
        p.anchorSize = m.size;
      }
    };

    const ensureBake = (L: Layout) => {
      const bw = Math.max(1, Math.round(L.barW * L.dpr));
      const bh = Math.max(1, Math.round(Math.max(1, L.barBot - L.barTop) * L.dpr));
      if (!bakeRef.current.canvas) bakeRef.current.canvas = document.createElement("canvas");
      if (bakeRef.current.w !== bw || bakeRef.current.h !== bh) {
        bakeRef.current.canvas.width = bw;
        bakeRef.current.canvas.height = bh;
        bakeRef.current.w = bw;
        bakeRef.current.h = bh;
        bakeRef.current.ctx = bakeRef.current.canvas.getContext("2d");
      }
      return bakeRef.current.ctx;
    };

    const stampId = (eventId: string, L: Layout) => {
      const pack = packByIdRef.current.get(eventId);
      if (!pack) return;
      const bctx = ensureBake(L);
      if (!bctx) return;
      const dpr = L.dpr;
      // Cell stamp in bake local coords (cellX × cellY — may be non-square when dense)
      const bw = pack.side * L.cellX * dpr;
      const bh = pack.side * L.cellY * dpr;
      const x = (L.mosaicX - L.barLeft + pack.col * L.cellX) * dpr;
      const y =
        (L.mosaicY - L.barTop + L.mosaicH - (pack.row + pack.side) * L.cellY) * dpr;
      bctx.fillStyle = pack.color;
      bctx.fillRect(x, y, Math.max(1, bw), Math.max(1, bh));
      if (pack.side >= 2 && Math.min(bw, bh) > 4) {
        bctx.strokeStyle = "rgba(0,0,0,0.22)";
        bctx.lineWidth = Math.max(1, dpr);
        bctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, bw - 1), Math.max(0, bh - 1));
      }
    };

    const rebuildBake = (L: Layout) => {
      const bctx = ensureBake(L);
      if (!bctx) return;
      const bw = bakeRef.current.w;
      const bh = bakeRef.current.h;
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.clearRect(0, 0, bw, bh);
      bctx.fillStyle = "rgba(238,247,255,0.06)";
      bctx.fillRect(0, 0, bw, bh);
      bctx.fillStyle = "rgba(255,255,255,0.08)";
      const step = Math.max(3, Math.round(3 * L.dpr));
      for (let yy = 0; yy < bh; yy += step) {
        for (let xx = 0; xx < bw; xx += step) bctx.fillRect(xx + 1, yy + 1, 1, 1);
      }
      for (const id of inLandedRef.current) stampId(id, L);
      bakeDirtyRef.current = false;
    };

    const measure = (): Layout | null => {
      const w = Math.floor(wrap.clientWidth);
      const h = Math.floor(wrap.clientHeight);
      if (w < 32 || h < 64) return null;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const bw = Math.round(w * dpr);
      const bh = Math.round(h * dpr);
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
        bakeDirtyRef.current = true;
      }
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      const inset = Math.max(12, Math.floor(h * 0.05));
      const maxBarH = Math.max(48, h - inset * 2);
      // Always keep a readable width — never collapse to a hairline on dense 7d
      const barW = Math.max(MIN_BAR_W, Math.min(240, Math.floor(w * 0.28)));
      const barH = maxBarH;
      const barLeft = Math.floor((w - barW) / 2);
      const barTop = inset;
      const barBot = barTop + barH;
      const rows = Math.max(1, packRowsRef.current);
      const cols = Math.max(GRID_COLS_MIN, packColsRef.current);
      // Fill the whole shell. Dense packs get flatter cells; sparse stay near-square.
      const cellX = barW / cols;
      const cellY = barH / rows;
      const mosaicW = barW;
      const mosaicH = barH;
      const mosaicX = barLeft;
      const mosaicY = barTop;

      return {
        w,
        h,
        dpr,
        barLeft,
        barTop,
        barBot,
        barW,
        cellX,
        cellY,
        cols,
        rows,
        mosaicX,
        mosaicY,
        mosaicW,
        mosaicH,
      };
    };

    let syncAcc = 0;

    const tick = (ts: number) => {
      rafRef.current = requestAnimationFrame(tick);
      const L = measure();
      if (!L) return;
      layoutRef.current = L;

      const dt = lastTsRef.current ? Math.min(0.05, (ts - lastTsRef.current) / 1000) : 0;
      lastTsRef.current = ts;
      const mult = speedRef.current;

      // Full membership sync occasionally (or when scroll flags needSync).
      // Phase is always restored from phaseRef — never rewinds.
      syncAcc += dt;
      if (needSyncRef.current || syncAcc > 0.2 || particlesRef.current.length === 0) {
        syncAcc = 0;
        needSyncRef.current = false;
        syncParticles(L);
      } else {
        // Every frame: only re-measure swatch positions (smooth scroll follow)
        reanchorParticles();
      }

      if (bakeDirtyRef.current) rebuildBake(L);

      /**
       * Desired mosaic uses the **full pack order** (newest-first), not the
       * paginated list page — so intro / top-of-list can fill every cell.
       *
       *  - Intro or scrollTop≈0: minIdx=0 → entire pack
       *  - Scrolled: minIdx = pack index of topmost visible row → drop newer
       */
      const computeDesiredLanded = (): Set<string> => {
        const order = packOrderRef.current; // newest first, full pack
        const n = order.length;
        const desired = new Set<string>();
        if (n === 0) return desired;

        const intro =
          introActiveRef.current && !userScrolledDepositsRef.current;

        let minIdx = 0;
        if (!intro && userScrolledDepositsRef.current) {
          const inList = inListRef.current;
          const list = depositsRef.current;
          if (inList && list.length > 0) {
            const maxScroll = inList.scrollHeight - inList.clientHeight;
            const exploration =
              maxScroll <= 1
                ? 0
                : Math.min(1, Math.max(0, inList.scrollTop / maxScroll));

            // Prefer topmost visible deposit → its index in the full pack order
            const listRect = inList.getBoundingClientRect();
            let topVisId: string | null = null;
            for (let i = 0; i < list.length; i++) {
              const el = rowElsRef.current.get(list[i].id);
              if (el && isVisibleInList(el, listRect)) {
                topVisId = list[i].id;
                break;
              }
            }
            if (topVisId) {
              const packIdx = order.indexOf(topVisId);
              minIdx = packIdx >= 0 ? packIdx : Math.floor(exploration * (n - 1));
            } else {
              minIdx = Math.floor(exploration * (n - 1));
            }
            // Still at top of list → keep full pack (complete fill)
            if (inList.scrollTop <= 2) minIdx = 0;
          }
        }

        for (let i = minIdx; i < n; i++) desired.add(order[i]);
        return desired;
      };

      const desired = computeDesiredLanded();
      const intro =
        introActiveRef.current && !userScrolledDepositsRef.current;

      // —— Scroll velocity (deposit list) → fill/empty tempo ——
      // Sample every frame so fling inertia still drives the mosaic after
      // the pointer stops.
      const sk = scrollKinRef.current;
      const inList = inListRef.current;
      const nowMs = performance.now();
      if (inList && userScrolledDepositsRef.current) {
        const top = inList.scrollTop;
        const dTop = top - sk.lastTop;
        if (sk.lastTs > 0) {
          const dSec = (nowMs - sk.lastTs) / 1000;
          if (dSec > 0.001 && dSec < 0.12) {
            if (Math.abs(dTop) > 0.5) {
              // EMA — snappy enough to track flings, not jittery
              sk.vel = sk.vel * 0.72 + (dTop / dSec) * 0.28;
            } else {
              sk.vel *= 0.88; // decay when the list is still
            }
          }
        }
        sk.lastTop = top;
        sk.lastTs = nowMs;
      } else if (!intro) {
        sk.vel *= 0.9;
      }
      // |vel| in “rows/s” (≈28px row) → 0…1+ intensity
      const ROW_PX = 28;
      const scrollRowsPerSec = Math.abs(sk.vel) / ROW_PX;
      const scrollIntensity = Math.min(1.75, scrollRowsPerSec / 14);

      // Pending unland (newest first when scrolling down drops newers)
      const order = packOrderRef.current;
      const toUnland: string[] = [];
      if (!intro && userScrolledDepositsRef.current) {
        for (const id of order) {
          if (inLandedRef.current.has(id) && !desired.has(id)) toUnland.push(id);
        }
      }
      // Cancel fill flights that left the desired set (mid-scroll)
      if (fillFlightsRef.current.some((f) => !desired.has(f.eventId))) {
        fillFlightsRef.current = fillFlightsRef.current.filter((f) =>
          desired.has(f.eventId),
        );
      }

      // Pending fills — oldest first (history order: past → present)
      const flying = new Set(fillFlightsRef.current.map((f) => f.eventId));
      fillQueueRef.current = [];
      for (let i = order.length - 1; i >= 0; i--) {
        const id = order[i];
        if (desired.has(id) && !inLandedRef.current.has(id) && !flying.has(id)) {
          fillQueueRef.current.push(id);
        }
      }

      // Intro complete when the full pack has landed
      if (
        intro &&
        fillQueueRef.current.length === 0 &&
        fillFlightsRef.current.length === 0 &&
        desired.size > 0 &&
        inLandedRef.current.size >= desired.size
      ) {
        introActiveRef.current = false;
      }

      if (!reducedRef.current && dt > 0) {
        const rem = fillQueueRef.current.length;
        /**
         * Intro: all cells fly in (no bulk-stamp).
         * 7d only: ~1.69× faster (3× → −25% → −25%). 24h keeps the baseline.
         */
        const INTRO_SPEED = windowKeyRef.current === "7d" ? 1.6875 : 1;
        const introScale =
          rem > 2000 ? 2.4 : rem > 1000 ? 2.0 : rem > 400 ? 1.65 : rem > 100 ? 1.35 : 1.15;
        const fillMult = intro
          ? Math.max(mult * introScale, mult + 0.5) * INTRO_SPEED
          : mult * (0.55 + scrollIntensity * 2.4);
        const maxFly = Math.min(
          120,
          intro
            ? (rem > 800 ? 48 : rem > 200 ? 36 : 28) * INTRO_SPEED
            : Math.round(12 + scrollIntensity * 28),
          Math.round(
            (intro ? 12 : 8 + scrollIntensity * 10) *
              Math.sqrt(Math.max(1, fillMult)),
          ),
        );
        const baseSpawn = intro
          ? (rem > 1500
              ? 22
              : rem > 600
                ? 16
                : rem > 200
                  ? 12
                  : rem > 60
                    ? 8
                    : 5) * INTRO_SPEED
          : rem > 100
            ? 6 + scrollIntensity * 22
            : rem > 40
              ? 4 + scrollIntensity * 16
              : rem > 10
                ? 3 + scrollIntensity * 12
                : 2 + scrollIntensity * 8;
        const spawnRate =
          baseSpawn * fillMult * (intro || scrollIntensity > 0.04 ? 1 : 0.35);
        fillAccRef.current += dt * spawnRate;
        while (
          fillAccRef.current >= 1 &&
          fillQueueRef.current.length > 0 &&
          fillFlightsRef.current.length < maxFly
        ) {
          fillAccRef.current -= 1;
          const eventId = fillQueueRef.current.shift()!;
          if (inLandedRef.current.has(eventId)) continue;
          const pack = packByIdRef.current.get(eventId);
          if (!pack) continue;
          const h = hash01(eventId + "fill");
          // 3× shorter intro flights vs prior (still visible at 10×)
          const periodScale = intro
            ? (rem > 1000 ? 0.48 + h * 0.28 : 0.58 + h * 0.32) / INTRO_SPEED
            : (0.75 + h * 0.45) / (1 + scrollIntensity * 1.8);
          const period = BASE_TRAVERSE_SEC * periodScale;
          fillFlightsRef.current.push({
            eventId,
            color: pack.color,
            edge: pack.flight,
            t: 0,
            speed: 1 / period,
            jitter: hash01(eventId + "fj"),
            x0: L.w * 0.03 + h * 14,
            y0: L.h * (0.08 + h * 0.84),
            col: pack.col,
            row: pack.row,
            cells: pack.side,
          });
        }

        // Empty rate also tracks scroll — unland a few cells per frame, not all at once
        if (toUnland.length > 0) {
          const unlandPerSec = Math.max(
            4,
            scrollRowsPerSec * 1.15 + (scrollIntensity < 0.03 ? 2 : 0),
          );
          sk.unlandAcc += dt * unlandPerSec;
          let rebuilt = false;
          while (sk.unlandAcc >= 1 && toUnland.length > 0) {
            sk.unlandAcc -= 1;
            const id = toUnland.shift()!;
            if (!desired.has(id) && inLandedRef.current.delete(id)) {
              rebuilt = true;
              for (const p of particlesRef.current) {
                if (p.side === 0 && p.eventId === id) p.landedOnce = true;
              }
            }
          }
          if (rebuilt) rebuildBake(L);
        } else {
          sk.unlandAcc = 0;
        }

        for (let i = fillFlightsRef.current.length - 1; i >= 0; i--) {
          const f = fillFlightsRef.current[i];
          // Drop if scroll removed this deposit from desired mid-flight
          if (!desired.has(f.eventId)) {
            fillFlightsRef.current.splice(i, 1);
            continue;
          }
          // Intro: softer √mult flight advance so cubes stay readable at 10×
          const flightMult = intro
            ? Math.max(1.1, Math.sqrt(mult) * Math.min(introScale, 2) * INTRO_SPEED)
            : fillMult;
          f.t += f.speed * flightMult * dt;
          if (f.t >= 1) {
            if (!inLandedRef.current.has(f.eventId)) {
              inLandedRef.current.add(f.eventId);
              stampId(f.eventId, L);
              for (const p of particlesRef.current) {
                if (p.side === 0 && p.eventId === f.eventId) p.landedOnce = true;
              }
            }
            fillFlightsRef.current.splice(i, 1);
          }
        }

        // Continuous row-anchored flow (ambient after land; can slot if not yet filled)
        for (const p of particlesRef.current) {
          if (p.side === 0 && inLandedRef.current.has(p.eventId)) {
            p.landedOnce = true;
          }
          if (p.side === 0 && !desired.has(p.eventId)) {
            p.landedOnce = true; // don't slot into a cell that's been removed
          }
          p.t += p.speed * mult * dt;
          if (p.t >= 1) {
            p.t -= Math.floor(p.t);
            if (
              p.side === 0 &&
              !p.landedOnce &&
              desired.has(p.eventId) &&
              !inLandedRef.current.has(p.eventId)
            ) {
              p.landedOnce = true;
              inLandedRef.current.add(p.eventId);
              stampId(p.eventId, L);
            }
          }
          phaseRef.current.set(p.id, { t: p.t, landedOnce: p.landedOnce });
        }
      } else if (reducedRef.current) {
        // Instant snap to scroll depth
        for (const id of desired) {
          if (!inLandedRef.current.has(id)) {
            inLandedRef.current.add(id);
            stampId(id, L);
          }
        }
        fillFlightsRef.current = [];
        fillQueueRef.current = [];
      }

      ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
      ctx.clearRect(0, 0, L.w, L.h);

      // Edge flecks
      for (let i = 0; i < 12; i++) {
        const y = L.h * (0.1 + (i / 11) * 0.8);
        ctx.fillStyle = "rgba(238,247,255,0.04)";
        ctx.fillRect(L.w * 0.02, y - 2, 4, 4);
        ctx.fillRect(L.w * 0.98 - 4, y - 2, 4, 4);
      }

      const gridH = L.barBot - L.barTop;

      // Bar shell
      roundRectPath(ctx, L.barLeft, L.barTop, L.barW, gridH, 5);
      ctx.fillStyle = "rgba(12, 16, 22, 0.92)";
      ctx.fill();
      ctx.strokeStyle = "rgba(238,247,255,0.28)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Mosaic bake (square cells) — grows as fill lands
      ctx.save();
      roundRectPath(ctx, L.barLeft, L.barTop, L.barW, gridH, 4);
      ctx.clip();
      paintChipDots(ctx, L.barLeft, L.barTop, L.barW, gridH, "rgba(238,247,255,0.04)", 0.07);
      if (bakeRef.current.canvas && bakeRef.current.w > 0) {
        ctx.drawImage(bakeRef.current.canvas, L.barLeft, L.barTop, L.barW, gridH);
      }
      ctx.restore();

      ctx.strokeStyle = "rgba(238,247,255,0.16)";
      ctx.lineWidth = 1;
      roundRectPath(ctx, L.barLeft, L.barTop, L.barW, gridH, 4);
      ctx.stroke();

      // Fill flights (progressive pack reveal)
      for (const f of fillFlightsRef.current) {
        const s = sampleFill(f, L, f.t);
        if (s.alpha < 0.02) continue;
        if (s.phase === "slot") {
          ctx.save();
          roundRectPath(ctx, L.barLeft, L.barTop, L.barW, gridH, 4);
          ctx.clip();
          drawCube(ctx, s.x, s.y, s.size, f.color, 0.94 * s.alpha);
          ctx.restore();
        } else if (s.phase === "approach") {
          drawCube(ctx, s.x, s.y, s.size, f.color, 0.94 * s.alpha);
        }
      }

      // Row-anchored continuous particles
      for (const p of particlesRef.current) {
        const s =
          p.side === 0 ? sampleIn(p, L, p.t) : sampleOut(p, L, p.t);
        if (s.alpha < 0.02) continue;

        if (p.side === 0 && s.phase === "slot") {
          ctx.save();
          roundRectPath(ctx, L.barLeft, L.barTop, L.barW, gridH, 4);
          ctx.clip();
          drawCube(ctx, s.x, s.y, s.size, p.color, 0.94 * s.alpha);
          ctx.restore();
        } else if (p.side === 0 && s.phase === "approach") {
          drawCube(ctx, s.x, s.y, s.size, p.color, 0.94 * s.alpha);
        } else if (p.side === 1) {
          drawCube(ctx, s.x, s.y, s.size, p.color, 0.94 * s.alpha);
        }
      }

      const labelA = Math.max(
        0.1,
        0.36 * (1 - inLandedRef.current.size / Math.max(1, packByIdRef.current.size)),
      );
      ctx.fillStyle = `rgba(238,247,255,${labelA})`;
      ctx.font = "600 10px ui-monospace, Menlo, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.save();
      ctx.translate(L.barLeft + L.barW / 2, (L.barTop + L.barBot) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText("P O O L", 0, 0);
      ctx.restore();
    };

    rafRef.current = requestAnimationFrame(tick);
    const ro = new ResizeObserver(() => {
      bakeDirtyRef.current = true;
    });
    ro.observe(wrap);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      animStartedRef.current = false;
    };
  }, []);

  const onListScroll = (e: UIEvent<HTMLUListElement>) => {
    const list = e.currentTarget;
    // Re-anchor / refresh membership only — do NOT clear particles or reset t
    needSyncRef.current = true;
    // Deposit column scroll ends intro; velocity sampled in the rAF loop
    if (list === inListRef.current || list.classList.contains("flow-list-in")) {
      const top = list.scrollTop;
      const sk = scrollKinRef.current;
      const now = performance.now();
      if (sk.lastTs > 0) {
        const dSec = (now - sk.lastTs) / 1000;
        if (dSec > 0.0005 && dSec < 0.15) {
          sk.vel = sk.vel * 0.5 + ((top - sk.lastTop) / dSec) * 0.5;
        }
      }
      sk.lastTop = top;
      sk.lastTs = now;
      if (top > 2 || list.scrollLeft > 2) {
        userScrolledDepositsRef.current = true;
        introActiveRef.current = false;
      }
    }
    if (!canLoadMore) return;
    const horizontal = list.scrollWidth > list.clientWidth + 2;
    const nearEnd = horizontal
      ? list.scrollLeft + list.clientWidth > list.scrollWidth - 80
      : list.scrollTop + list.clientHeight > list.scrollHeight - 80;
    if (nearEnd) loadMore();
  };

  const empty = snap.depositCount === 0 && snap.withdrawalCount === 0;
  const filteredEmpty = deposits.length === 0 && withdrawals.length === 0 && !empty;
  const loadUncertain = empty && snap.indexing && snap.indexedBlock == null;
  const inLabel = formatCount(snap.depositCount, snap.truncated);
  const outLabel = formatCount(snap.withdrawalCount, snap.truncated);
  const filteredInLabel = formatCount(filteredDeposits.length, false);
  const filteredOutLabel = formatCount(filteredWithdrawals.length, false);

  const lightDeposit = (d: FlowDeposit) => {
    setHoveredId(d.id);
    setHoveredPool(null);
    setHoveredAddress(d.from);
  };
  const lightWithdrawal = (w: FlowWithdrawal) => {
    setHoveredId(w.id);
    setHoveredPool(null);
    setHoveredAddress(null);
  };
  const clearRow = () => {
    setHoveredId(null);
    setHoveredPool(null);
    setHoveredAddress(null);
  };

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
                onClick={() => setWindow(w.key)}
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
              {deposits.map((d) => {
                const color = addressColorPaperTeal(d.from, "flight");
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
                      onPointerEnter={() => lightDeposit(d)}
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
              {canLoadMore && <li className="flow-list-more">scroll for more</li>}
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
              {withdrawals.map((w) => {
                const on = hoveredId === w.id;
                return (
                  <li key={w.id}>
                    <button
                      type="button"
                      className={`flow-row flow-row-out${on ? " is-on" : ""}`}
                      data-pool={w.pool}
                      style={{ ["--seg-color" as string]: OUT_ROW_HOVER }}
                      ref={(el) => setRowEl(w.id, el)}
                      onPointerEnter={() => lightWithdrawal(w)}
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
              {canLoadMore && <li className="flow-list-more">scroll for more</li>}
            </ul>
            <div className="flow-list-fade flow-list-fade-top" aria-hidden="true" />
            <div className="flow-list-fade flow-list-fade-bot" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(FlowPoolGrid);
