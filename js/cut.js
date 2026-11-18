// Cut list, sheet layouts (nesting), edge banding, hardware and cost.
import { finishById, matById, priceOf } from './core.js';
import { buildItem } from './models.js';

/* ================================================================ build everything in a project */

export function buildProject(project, lib) {
  const results = [];
  for (const item of project.items) {
    try {
      const out = buildItem(item, lib);
      results.push({ item, out });
    } catch (e) {
      results.push({ item, out: null, error: e.message });
    }
  }
  return results;
}

/* ================================================================ cut list */

// Group identical panels (same board, color, size, edges, grain) and number them
export function cutList(results, lib) {
  const s = lib.settings;
  const groups = new Map();
  for (const { item, out } of results) {
    if (!out) continue;
    const q = Math.max(1, item.qty || 1);
    for (const p of out.panels) {
      const m = matById(lib, p.mat);
      const edge = lib.edges.find((e) => e.id === p.edge) || lib.edges[0];
      // thick edge banding: cut the board smaller so the finished size is right
      const sub = s.subtractThick && edge.thick >= 1 ? edge.thick : 0;
      const cutL = p.L - p.eW * sub;
      const cutW = p.W - p.eL * sub;
      const grain = p.grain && grainMatters(m, p.color);
      const key = [p.mat, p.color, cutL.toFixed(1), cutW.toFixed(1), p.eL, p.eW, p.edge, grain].join('|');
      if (!groups.has(key)) {
        groups.set(key, { key, mat: p.mat, color: p.color, L: p.L, W: p.W, cutL, cutW, T: m.T, eL: p.eL, eW: p.eW, edge: p.edge, grain, qty: 0, names: new Set(), items: new Set(), roles: new Set(), notes: new Set() });
      }
      const g = groups.get(key);
      g.qty += q;
      g.names.add(p.name.replace(/^.* · /, ''));
      g.items.add(item.name);
      g.roles.add(p.role);
      if (p.note) g.notes.add(p.note);
    }
  }
  // sort: by board, then biggest parts first; number them
  const list = [...groups.values()].sort((a, b) => (a.mat + a.color).localeCompare(b.mat + b.color) || b.cutL * b.cutW - a.cutL * a.cutW);
  list.forEach((g, i) => {
    g.no = i + 1;
    g.name = [...g.names].slice(0, 3).join(' / ') + (g.names.size > 3 ? ' …' : '');
    g.itemNames = [...g.items];
  });
  return list;
}

export function grainMatters(mat, color) {
  if (!mat || !mat.grain) return false;
  if (mat.kind === 'Plywood') return true;
  return !!finishById(color).wood;
}

/* ================================================================ edge banding */

export function edgeBanding(list, lib) {
  const s = lib.settings;
  const totals = new Map();
  for (const g of list) {
    const pieces = (g.eL + g.eW) * g.qty;
    if (!pieces) continue;
    const mm = g.qty * (g.eL * g.L + g.eW * g.W) + pieces * s.edgeExtra;
    const key = g.edge + '|' + g.color;
    const t = totals.get(key) || { edge: g.edge, color: g.color, mm: 0, pieces: 0 };
    t.mm += mm;
    t.pieces += pieces;
    totals.set(key, t);
  }
  return [...totals.values()].map((t) => ({ ...t, m: (t.mm / 1000) * (1 + s.edgeWaste / 100) }));
}

/* ================================================================ hardware & linear materials */

export function hardware(results) {
  const hw = {};
  const linear = new Map();
  for (const { item, out } of results) {
    if (!out) continue;
    const q = Math.max(1, item.qty || 1);
    for (const [k, v] of Object.entries(out.hw)) hw[k] = (hw[k] || 0) + v * q;
    for (const l of out.linear) {
      const key = l.key + '|' + Math.round(l.len);
      const cur = linear.get(key) || { ...l, qty: 0 };
      cur.qty += l.qty * q;
      linear.set(key, cur);
    }
  }
  return { hw, linear: [...linear.values()] };
}

/* ================================================================ sheet layouts */

// Expand groups into single parts for one board+color, with cut sizes
function partsFor(list, mat, color) {
  const parts = [];
  for (const g of list) {
    if (g.mat !== mat || g.color !== color) continue;
    for (let i = 0; i < g.qty; i++) parts.push({ no: g.no, L: g.cutL, W: g.cutW, grain: g.grain, name: g.name });
  }
  return parts;
}

export function sheetGroups(list) {
  const seen = new Map();
  for (const g of list) {
    const k = g.mat + '|' + g.color;
    if (!seen.has(k)) seen.set(k, { mat: g.mat, color: g.color });
  }
  return [...seen.values()];
}

/*
 Strip cutting (best for a panel saw / table saw):
   1. rip strips along the sheet length,
   2. cross-cut each strip into columns,
   3. cut the parts stacked in a column.
 Every cut goes right through, so it's quick and safe to cut.
*/
function stripPack(parts, SL, SW, k) {
  const orient = (p) => {
    // grain runs along the sheet length: the part's length goes along the strip
    if (p.grain) return [[p.L, p.W]];
    return p.L >= p.W ? [[p.L, p.W], [p.W, p.L]] : [[p.W, p.L], [p.L, p.W]];
  };
  const sorted = [...parts].sort((a, b) => Math.min(b.L, b.W) - Math.min(a.L, a.W) || Math.max(b.L, b.W) - Math.max(a.L, a.W));
  const sheets = [];
  const tooBig = [];
  const newSheet = () => { const s = { strips: [], usedH: 0 }; sheets.push(s); return s; };
  for (const p of sorted) {
    const opts = orient(p).filter(([l, w]) => l <= SL && w <= SW);
    if (!opts.length) { tooBig.push(p); continue; }
    let placed = false;
    // 1) into an existing column (stacked in a strip)
    for (const sh of sheets) {
      for (const st of sh.strips) {
        for (const col of st.cols) {
          for (const [l, w] of opts) {
            if (l <= col.w && col.used + k + w <= st.h + 1e-6) {
              col.parts.push({ p, l, w, y: col.used + k });
              col.used += k + w;
              placed = true;
              break;
            }
          }
          if (placed) break;
        }
        if (placed) break;
        // 2) a new column at the end of the strip
        for (const [l, w] of opts) {
          if (w <= st.h && st.used + (st.cols.length ? k : 0) + l <= SL + 1e-6) {
            const x = st.used + (st.cols.length ? k : 0);
            st.cols.push({ x, w: l, used: w, parts: [{ p, l, w, y: 0 }] });
            st.used = x + l;
            placed = true;
            break;
          }
        }
        if (placed) break;
      }
      if (placed) break;
    }
    if (placed) continue;
    // 3) a new strip on a sheet with room, else a new sheet
    const [l, w] = opts.sort((a, b) => a[1] - b[1])[0];
    let sh = sheets.find((s) => s.usedH + (s.strips.length ? k : 0) + w <= SW + 1e-6);
    if (!sh) sh = newSheet();
    const y = sh.usedH + (sh.strips.length ? k : 0);
    sh.strips.push({ y, h: w, used: l, cols: [{ x: 0, w: l, used: w, parts: [{ p, l, w, y: 0 }] }] });
    sh.usedH = y + w;
  }
  // to placements + saw steps
  return {
    tooBig,
    sheets: sheets.map((sh) => {
      const placements = [];
      const steps = [];
      sh.strips.forEach((st, si) => {
        steps.push({ type: 'rip', text: `Rip strip ${si + 1}: ${Math.round(st.h)} mm wide, full length`, at: st.y + st.h, axis: 'y' });
        st.cols.forEach((col, ci) => {
          if (col.x + col.w < SL - 1 || st.cols.length > 1) steps.push({ type: 'cross', text: `  Cross-cut at ${Math.round(col.w)} mm`, strip: si });
          col.parts.forEach((pp, pi) => {
            placements.push({ no: pp.p.no, name: pp.p.name, x: col.x, y: st.y + pp.y, w: pp.l, h: pp.w, rotated: pp.l !== pp.p.L });
            const needWidthCut = pp.w < st.h - 1 || col.parts.length > 1;
            if (needWidthCut) steps.push({ type: 'trim', text: `    Cut part #${pp.p.no} to ${Math.round(pp.w)} mm` });
          });
        });
      });
      return { placements, steps, cuts: [] };
    }),
  };
}

/*
 Max yield (guillotine nesting): fits parts into the leftover rectangles to use fewer sheets.
 Every cut still goes straight through its piece (guillotine cuts), so it can be cut on any saw.
*/
function guillotinePack(parts, SL, SW, k, order, split) {
  const sorted = [...parts].sort(order);
  const sheets = [];
  const tooBig = [];
  for (const p of sorted) {
    const opts = p.grain ? [[p.L, p.W]] : [[p.L, p.W], [p.W, p.L]];
    if (!opts.some(([l, w]) => l <= SL && w <= SW)) { tooBig.push(p); continue; }
    let best = null;
    for (const sh of sheets) {
      sh.free.forEach((r, ri) => {
        for (const [l, w] of opts) {
          if (l <= r.w + 1e-6 && w <= r.h + 1e-6) {
            const score = Math.min(r.w - l, r.h - w) * 1e6 + (r.w * r.h - l * w);
            if (!best || score < best.score) best = { sh, ri, l, w, score };
          }
        }
      });
    }
    if (!best) {
      const sh = { free: [{ x: 0, y: 0, w: SL, h: SW }], placements: [], cuts: [] };
      sheets.push(sh);
      const [l, w] = opts.find(([a, b]) => a <= SL && b <= SW);
      best = { sh, ri: 0, l, w };
    }
    const { sh, ri, l, w } = best;
    const r = sh.free.splice(ri, 1)[0];
    sh.placements.push({ no: p.no, name: p.name, x: r.x, y: r.y, w: l, h: w, rotated: l !== p.L });
    const rw = r.w - l - k;
    const rh = r.h - w - k;
    // choose the split direction
    const horizontal = split === 'short' ? (r.w - l) < (r.h - w) : split === 'long' ? (r.w - l) >= (r.h - w) : (rw * r.h) < (r.w * rh);
    if (horizontal) {
      // cut across first (full width of the piece), then the strip with the part
      if (rh > 0) sh.free.push({ x: r.x, y: r.y + w + k, w: r.w, h: rh });
      if (rw > 0) sh.free.push({ x: r.x + l + k, y: r.y, w: rw, h: w });
      sh.cuts.push({ x1: r.x, y1: r.y + w, x2: r.x + r.w, y2: r.y + w }, { x1: r.x + l, y1: r.y, x2: r.x + l, y2: r.y + w });
    } else {
      if (rw > 0) sh.free.push({ x: r.x + l + k, y: r.y, w: rw, h: r.h });
      if (rh > 0) sh.free.push({ x: r.x, y: r.y + w + k, w: l, h: rh });
      sh.cuts.push({ x1: r.x + l, y1: r.y, x2: r.x + l, y2: r.y + r.h }, { x1: r.x, y1: r.y + w, x2: r.x + l, y2: r.y + w });
    }
  }
  return { tooBig, sheets: sheets.map((s) => ({ placements: s.placements, cuts: s.cuts, free: s.free, steps: [] })) };
}

const ORDERS = [
  (a, b) => b.L * b.W - a.L * a.W,
  (a, b) => Math.max(b.L, b.W) - Math.max(a.L, a.W) || b.L * b.W - a.L * a.W,
  (a, b) => b.L + b.W - (a.L + a.W),
  (a, b) => Math.min(b.L, b.W) - Math.min(a.L, a.W) || Math.max(b.L, b.W) - Math.max(a.L, a.W),
];

export function layoutSheets(list, lib, mode) {
  const s = lib.settings;
  const k = s.kerf;
  const out = [];
  for (const { mat, color } of sheetGroups(list)) {
    const m = matById(lib, mat);
    const trim = m.trim ?? s.trim; // finished boards (worktops) have no edge trim
    const SL = m.sheetL - 2 * trim;
    const SW = m.sheetW - 2 * trim;
    const parts = partsFor(list, mat, color);
    const strip = stripPack(parts, SL, SW, k);
    let best = null;
    for (const order of ORDERS) for (const split of ['short', 'long', 'area']) {
      const r = guillotinePack(parts, SL, SW, k, order, split);
      if (!best || r.sheets.length < best.sheets.length) best = r;
    }
    const chosen = mode === 'yield' ? best : strip;
    const partArea = parts.filter((p) => !chosen.tooBig.includes(p)).reduce((a, p) => a + p.L * p.W, 0);
    const sheets = chosen.sheets.map((sh) => {
      const used = sh.placements.reduce((a, p) => a + p.w * p.h, 0);
      return { ...sh, util: used / (m.sheetL * m.sheetW), offcuts: offcuts(sh, SL, SW, k) };
    });
    out.push({
      mat, color, material: m, sheetL: m.sheetL, sheetW: m.sheetW, trim, kerf: k, SL, SW, sheets, tooBig: chosen.tooBig,
      partCount: parts.length, partArea, util: sheets.length ? partArea / (sheets.length * m.sheetL * m.sheetW) : 0,
      alt: { strips: strip.sheets.length, yield: best.sheets.length },
    });
  }
  return out;
}

// Leftover pieces big enough to keep (at least 100 × 100 mm)
function offcuts(sh, SL, SW, k) {
  if (sh.free) return sh.free.filter((r) => r.w >= 100 && r.h >= 100).sort((a, b) => b.w * b.h - a.w * a.h);
  // strip mode: right end of each strip, and the space below the last strip
  const res = [];
  const ys = new Map();
  for (const p of sh.placements) ys.set(p.y, Math.max(ys.get(p.y) || 0, p.x + p.w));
  const maxY = sh.placements.reduce((a, p) => Math.max(a, p.y + p.h), 0);
  if (SW - maxY - k >= 100) res.push({ x: 0, y: maxY + k, w: SL, h: SW - maxY - k });
  return res;
}

/* ================================================================ cost */

export function costs(project, lib, layouts, edges, hwRes) {
  const s = lib.settings;
  const lines = [];
  for (const L of layouts) lines.push({ label: `${L.material.name} · ${finishById(L.color).name}`, qty: L.sheets.length, unit: 'sheets', price: priceOf(L.material, lib), key: 'mat:' + L.material.id });
  for (const e of edges) {
    const def = lib.edges.find((x) => x.id === e.edge) || {};
    lines.push({ label: `${def.name || e.edge} · ${finishById(e.color).name}`, qty: Math.ceil(e.m), unit: 'm', price: priceOf(def, lib), key: 'edge:' + e.edge });
  }
  for (const [k, n] of Object.entries(hwRes.hw)) {
    const h = lib.hardware[k];
    if (h) lines.push({ label: h.name, qty: Math.round(n * 10) / 10, unit: h.unit, price: priceOf(h, lib), key: 'hw:' + k });
  }
  const lin = new Map();
  for (const l of hwRes.linear) {
    const h = lib.hardware[l.key];
    if (!h) continue;
    const qty = l.area ? l.area : (l.len * l.qty) / 1000;
    lin.set(l.key, (lin.get(l.key) || 0) + qty);
  }
  for (const [k, q] of lin) lines.push({ label: lib.hardware[k].name, qty: Math.ceil(q * 10) / 10, unit: lib.hardware[k].unit, price: priceOf(lib.hardware[k], lib), key: 'hw:' + k });
  const materials = lines.reduce((a, l) => a + l.qty * l.price, 0);
  const labour = (materials * (project.labour ?? s.labour)) / 100;
  const subtotal = materials + labour;
  const profit = (subtotal * (project.profit ?? s.profit)) / 100;
  return { lines, materials, labour, profit, total: subtotal + profit, missingPrices: lines.filter((l) => !l.price).length };
}
