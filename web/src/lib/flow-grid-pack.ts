/**
 * Dense grid packing for the pool-bar mosaic prototype.
 * Largest-first + bottom-left + gravity compact.
 * Pure helpers — no DOM.
 */

import type { FlowPool } from "./flow";

/** Cell footprint per denom (side × side cells). */
export const POOL_SIDE: Record<FlowPool, number> = {
  "0.1": 1,
  "1": 2,
  "10": 4,
  "100": 8,
};

/** Flight cube size (px-ish) before morph — mirrors POOL_META.particlePx scale. */
export const POOL_FLIGHT_PX: Record<FlowPool, number> = {
  "0.1": 5.5,
  "1": 7.5,
  "10": 11,
  "100": 15,
};

export type PackItem = {
  id: string;
  pool: FlowPool;
  address: string;
  color: string;
  side: number;
  flight: number;
  /** Stable order from data (newest-first lists use reverse). */
  inputOrder: number;
};

export type PlacedBlock = PackItem & {
  idx: number;
  col: number;
  row: number;
};

const MAX_ROWS = 500;

function cellFree(
  grid: Int32Array,
  cols: number,
  nRows: number,
  col: number,
  row: number,
  side: number,
): boolean {
  if (row < 0 || col < 0 || row + side > nRows || col + side > cols) return false;
  for (let dr = 0; dr < side; dr++) {
    for (let dc = 0; dc < side; dc++) {
      if (grid[(row + dr) * cols + (col + dc)] !== -1) return false;
    }
  }
  return true;
}

function mark(
  grid: Int32Array,
  cols: number,
  col: number,
  row: number,
  side: number,
  id: number,
) {
  for (let dr = 0; dr < side; dr++) {
    for (let dc = 0; dc < side; dc++) {
      grid[(row + dr) * cols + (col + dc)] = id;
    }
  }
}

function unmark(
  grid: Int32Array,
  cols: number,
  col: number,
  row: number,
  side: number,
) {
  for (let dr = 0; dr < side; dr++) {
    for (let dc = 0; dc < side; dc++) {
      grid[(row + dr) * cols + (col + dc)] = -1;
    }
  }
}

function findSpotBottomLeft(
  grid: Int32Array,
  cols: number,
  nRows: number,
  side: number,
): { col: number; row: number } | null {
  for (let row = 0; row + side <= nRows; row++) {
    for (let col = 0; col + side <= cols; col++) {
      if (cellFree(grid, cols, nRows, col, row, side)) return { col, row };
    }
  }
  return null;
}

function compactGrid(
  placed: PlacedBlock[],
  cols: number,
  nRows: number,
): number {
  const grid = new Int32Array(nRows * cols).fill(-1);
  for (const p of placed) mark(grid, cols, p.col, p.row, p.side, p.idx);

  let moved = true;
  let guard = 0;
  while (moved && guard++ < 400) {
    moved = false;
    const order = [...placed].sort(
      (a, b) => b.side - a.side || a.idx - b.idx,
    );
    for (const p of order) {
      unmark(grid, cols, p.col, p.row, p.side);
      let bestCol = p.col;
      let bestRow = p.row;
      for (let row = 0; row + p.side <= nRows; row++) {
        for (let col = 0; col + p.side <= cols; col++) {
          if (!cellFree(grid, cols, nRows, col, row, p.side)) continue;
          if (row < bestRow || (row === bestRow && col < bestCol)) {
            bestRow = row;
            bestCol = col;
          }
        }
      }
      if (bestCol !== p.col || bestRow !== p.row) moved = true;
      p.col = bestCol;
      p.row = bestRow;
      mark(grid, cols, p.col, p.row, p.side, p.idx);
    }
  }

  let used = 1;
  for (const p of placed) used = Math.max(used, p.row + p.side);
  return used;
}

function shuffleInPlace<T>(a: T[], rng: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const k = Math.floor(rng() * (i + 1));
    [a[i], a[k]] = [a[k], a[i]];
  }
  return a;
}

/** Deterministic mulberry32 from seed string. */
export function rngFromSeed(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let t = h >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export type PackResult = {
  placed: PlacedBlock[];
  rows: number;
  cols: number;
  overflow: number;
  fillPct: number;
};

/**
 * Pack items into a cols-wide grid. Returns placed blocks (launch-shuffled)
 * and used row count.
 */
export function packItems(
  items: PackItem[],
  cols: number,
  seed = "pack",
): PackResult {
  const rng = rngFromSeed(seed);
  const sorted = [...items].sort(
    (a, b) => b.side - a.side || a.inputOrder - b.inputOrder,
  );
  const totalArea = sorted.reduce((s, d) => s + d.side * d.side, 0);
  let nRows = Math.max(
    POOL_SIDE["100"],
    Math.ceil(totalArea / Math.max(1, cols)),
  );

  let placed: PlacedBlock[] = [];
  let overflow = 0;

  const placeList = (list: PackItem[], nR: number, partial: boolean) => {
    const grid = new Int32Array(nR * cols).fill(-1);
    const out: PlacedBlock[] = [];
    let missed = 0;
    for (const d of list) {
      const spot = findSpotBottomLeft(grid, cols, nR, d.side);
      if (!spot) {
        missed += 1;
        if (!partial) return { ok: false as const, placed: out };
        continue;
      }
      const id = out.length;
      mark(grid, cols, spot.col, spot.row, d.side, id);
      out.push({
        ...d,
        idx: id,
        col: spot.col,
        row: spot.row,
      });
    }
    return {
      ok: partial || missed === 0,
      placed: out,
      missed,
    };
  };

  let result = placeList(sorted, nRows, false);
  let attempts = 0;
  while (!result.ok && nRows < MAX_ROWS && attempts < 24) {
    nRows = Math.min(MAX_ROWS, nRows + Math.max(2, Math.ceil(nRows * 0.06)));
    result = placeList(sorted, nRows, false);
    attempts += 1;
  }
  if (!result.ok) {
    result = placeList(sorted, nRows, true);
    overflow = sorted.length - result.placed.length;
  }

  placed = result.placed;
  const used = compactGrid(placed, cols, nRows);
  shuffleInPlace(placed, rng);
  placed.forEach((p, i) => {
    p.idx = i;
  });

  const areaUsed = placed.reduce((s, p) => s + p.side * p.side, 0);
  const fillPct = used > 0 ? (100 * areaUsed) / (used * cols) : 0;

  return {
    placed,
    rows: used,
    cols,
    overflow,
    fillPct,
  };
}
