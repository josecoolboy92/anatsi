// Sheet cutting diagrams as SVG: numbered parts with sizes, offcuts, trimmed edges and saw cuts.
import { fmtLen } from './core.js';

const NS = 'http://www.w3.org/2000/svg';
const ROLE_FILL = {
  door: '#93c5fd', carcass: '#fde68a', shelf: '#bbf7d0', back: '#e7d3bd', drawer: '#fbcfe8', deck: '#ddd6fe',
  head: '#fecaca', rail: '#fed7aa', worktop: '#cbd5e1', plinth: '#d9f99d',
};

function svg(tag, attrs, text) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== undefined) n.textContent = text;
  return n;
}

export function sheetSVG(L, sheet, list, units = 'mm', { big = false } = {}) {
  const W = L.sheetL;
  const H = L.sheetW;
  const t = L.trim;
  const root = svg('svg', { viewBox: `-60 -60 ${W + 120} ${H + 130}`, class: 'sheet-svg', role: 'img', 'aria-label': `Sheet ${W} by ${H}` });
  root.append(svg('rect', { x: 0, y: 0, width: W, height: H, fill: '#f8f5ef', stroke: '#6b5f52', 'stroke-width': 4 }));
  // trimmed edge
  if (t > 0) root.append(svg('rect', { x: t, y: t, width: W - 2 * t, height: H - 2 * t, fill: 'none', stroke: '#c2410c', 'stroke-dasharray': '18 10', 'stroke-width': 3 }));
  const byNo = new Map(list.map((g) => [g.no, g]));
  const fs = Math.max(22, Math.min(46, W / 55));
  for (const p of sheet.placements) {
    const g = byNo.get(p.no) || {};
    const x = t + p.x;
    const y = t + p.y;
    const role = g.roles ? [...g.roles][0] : 'carcass';
    root.append(svg('rect', { x, y, width: p.w, height: p.h, fill: ROLE_FILL[role] || '#fde68a', stroke: '#3b3229', 'stroke-width': 3 }));
    const cx = x + p.w / 2;
    const cy = y + p.h / 2;
    const small = Math.min(p.w, p.h);
    const f = Math.max(14, Math.min(fs, small / 3.2));
    root.append(svg('text', { x: cx, y: cy - (small > f * 3 ? f * 0.35 : -f * 0.35), 'font-size': f * 1.1, 'font-weight': 800, 'text-anchor': 'middle', fill: '#1f1a15' }, `#${p.no}`));
    if (small > f * 3 && p.w > f * 6) {
      root.append(svg('text', { x: cx, y: cy + f * 0.95, 'font-size': f * 0.82, 'text-anchor': 'middle', fill: '#3b3229' }, `${fmtLen(p.w, units, false)} × ${fmtLen(p.h, units, false)}`));
    }
    // grain arrow along the part's length
    if (g.grain && small > 60) {
      const len = Math.min(p.w * 0.5, 160);
      const ay = y + Math.min(p.h - 16, f * 0.9);
      root.append(svg('path', { d: `M${cx - len / 2} ${ay} H${cx + len / 2} m-14 -9 l14 9 l-14 9`, stroke: '#7c2d12', 'stroke-width': 3, fill: 'none', opacity: 0.6 }));
    }
    // edge banding marks
    const eL = g.eL || 0;
    const eW = g.eW || 0;
    const along = p.rotated ? 'v' : 'h';
    const bandColor = g.edge === 'thick' ? '#b91c1c' : '#2563eb';
    const bw = g.edge === 'thick' ? 9 : 5;
    const marks = [];
    if (along === 'h') {
      if (eL >= 1) marks.push([x, y + p.h - bw / 2, x + p.w, y + p.h - bw / 2]);
      if (eL >= 2) marks.push([x, y + bw / 2, x + p.w, y + bw / 2]);
      if (eW >= 1) marks.push([x + bw / 2, y, x + bw / 2, y + p.h]);
      if (eW >= 2) marks.push([x + p.w - bw / 2, y, x + p.w - bw / 2, y + p.h]);
    } else {
      if (eL >= 1) marks.push([x + bw / 2, y, x + bw / 2, y + p.h]);
      if (eL >= 2) marks.push([x + p.w - bw / 2, y, x + p.w - bw / 2, y + p.h]);
      if (eW >= 1) marks.push([x, y + p.h - bw / 2, x + p.w, y + p.h - bw / 2]);
      if (eW >= 2) marks.push([x, y + bw / 2, x + p.w, y + bw / 2]);
    }
    for (const [x1, y1, x2, y2] of marks) root.append(svg('line', { x1, y1, x2, y2, stroke: bandColor, 'stroke-width': bw }));
  }
  // offcuts worth keeping
  for (const o of sheet.offcuts || []) {
    root.append(svg('rect', { x: t + o.x, y: t + o.y, width: o.w, height: o.h, fill: 'url(#hatch)', stroke: '#16a34a', 'stroke-width': 2, 'stroke-dasharray': '10 8' }));
    if (Math.min(o.w, o.h) > 120) root.append(svg('text', { x: t + o.x + o.w / 2, y: t + o.y + o.h / 2 + 10, 'font-size': Math.min(30, Math.min(o.w, o.h) / 4), 'text-anchor': 'middle', fill: '#15803d' }, `offcut ${Math.round(o.w)}×${Math.round(o.h)}`));
  }
  // saw cuts (max-yield layouts)
  if (big) for (const c of sheet.cuts || []) root.append(svg('line', { x1: t + c.x1, y1: t + c.y1, x2: t + c.x2, y2: t + c.y2, stroke: '#dc2626', 'stroke-width': 2, opacity: 0.55 }));
  // sheet size labels
  root.append(svg('text', { x: W / 2, y: -18, 'font-size': 34, 'text-anchor': 'middle', fill: '#a8a29e' }, fmtLen(W, units)));
  const side = svg('text', { x: -22, y: H / 2, 'font-size': 34, 'text-anchor': 'middle', fill: '#a8a29e', transform: `rotate(-90 -22 ${H / 2})` }, fmtLen(H, units));
  root.append(side);
  const defs = svg('defs', {});
  const pat = svg('pattern', { id: 'hatch', width: 24, height: 24, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
  pat.append(svg('line', { x1: 0, y1: 0, x2: 0, y2: 24, stroke: '#86efac', 'stroke-width': 6 }));
  defs.append(pat);
  root.prepend(defs);
  return root;
}

export const ROLE_COLORS = ROLE_FILL;
