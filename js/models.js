// Furniture models. Each model has adjustable settings ("params"), ready-made standards
// ("presets") and a build() that returns every panel with its cut size, edge banding and 3D position,
// plus hardware, metal/timber lengths, notes and warnings.
import { panel, r5, MATTRESS, maxShelfSpan, splitToFit } from './core.js';
export { splitToFit };
import { carcass } from './carcass.js';

const num = (k, label, def, o = {}) => ({ k, label, type: 'num', def, len: true, step: 1, ...o });
const cnt = (k, label, def, o = {}) => ({ k, label, type: 'num', def, len: false, step: 1, min: 0, ...o });
const sel = (k, label, def, opts, o = {}) => ({ k, label, type: 'sel', def, opts, ...o });
const bool = (k, label, def, o = {}) => ({ k, label, type: 'bool', def, ...o });
const mat = (k, label, def, o = {}) => ({ k, label, type: 'mat', def, ...o });
const color = (k, label, def, o = {}) => ({ k, label, type: 'color', def, ...o });

const newOut = () => ({ panels: [], hw: {}, linear: [], notes: [], warnings: [], size: { w: 0, h: 0, d: 0 }, rails: [], bars: [], legs: [] });
const addHw = (out, k, n) => { out.hw[k] = (out.hw[k] || 0) + n; };
const T = (lib, id) => (lib.materials.find((m) => m.id === id) || { T: 18 }).T;
const sheetOf = (lib, id) => lib.materials.find((m) => m.id === id) || lib.materials[0];

const MATERIAL_PARAMS = (o = {}) => [
  mat('mat', 'Carcass board', o.mat || 'mdf18', { section: 'Materials & colors' }),
  color('color', 'Carcass color', o.color || 'white', { section: 'Materials & colors' }),
  mat('doorMat', 'Door / front board', o.doorMat || 'mdf18', { section: 'Materials & colors' }),
  color('doorColor', 'Door / front color', o.doorColor || 'white', { section: 'Materials & colors' }),
  sel('doorEdge', 'Door edges', 'thick', [['thick', '2 mm PVC edge band'], ['none', 'No banding (painted / lacquered)']], { section: 'Materials & colors' }),
  mat('backMat', 'Back panel', 'hdf3', { section: 'Materials & colors' }),
];

/* ================================================================ KITCHEN */

function kitchenHeights(p) {
  // "Comfort" improves the standard: worktop at ~52.5% of the main cook's height
  if (p.standard === 'comfort') {
    const wt = Math.max(850, Math.min(1000, r5(p.cookH * 0.525)));
    return { worktopH: wt, wallGap: Math.max(550, r5(p.cookH * 0.33)), wallTop: Math.min(p.ceiling - 50, r5(p.cookH * 1.28)) };
  }
  if (p.standard === 'low') return { worktopH: 850, wallGap: 500, wallTop: Math.min(p.ceiling - 50, 2050) };
  if (p.standard === 'custom') return { worktopH: p.worktopH, wallGap: p.wallGap, wallTop: p.wallTop };
  return { worktopH: 900, wallGap: 550, wallTop: Math.min(p.ceiling - 50, 2200) };
}

// one base cabinet at position x
function baseUnit(p, lib, out, x, w, kind, prefix, h) {
  const t = T(lib, p.mat);
  const H = h.worktopH - p.worktopT - p.plinth;
  const sec = {
    doors: { shelves: p.shelves, doors: p.doors },
    drawers: { drawers: p.drawers, drawerFill: true },
    mixed: { drawers: 1, drawerPos: 'top', drawerH: 150, shelves: p.shelves, doors: p.doors },
    sink: { shelves: 0, doors: p.doors },
    open: { shelves: p.shelves, open: true },
  }[kind] || { shelves: p.shelves };
  carcass({
    x0: x, y0: p.plinth, z0: 0, W: w, H, D: p.depth, T: t, mat: p.mat, color: p.color,
    doorMat: p.doorMat, doorColor: p.doorColor, doorT: T(lib, p.doorMat), doorEdge: p.doorEdge,
    backMat: p.backMat, backT: T(lib, p.backMat), back: kind === 'sink' ? 'none' : 'nailed',
    drawerMat: p.mat, hdfMat: p.backMat, top: 'rails', sections: [sec], gap: p.gap, prefix,
  }, out, lib);
  if (kind === 'sink') out.notes.push(`${prefix}: no back panel and no shelf, so pipes can pass. Seal the bottom edges against water.`);
  addHw(out, 'legKitchen', w > 900 ? 6 : 4);
  addHw(out, 'plinthClip', 2);
  return H;
}

function wallUnit(p, lib, out, x, w, prefix, h, opts = {}) {
  const t = T(lib, p.mat);
  const H = opts.H ?? (h.wallTop - (h.worktopH + h.wallGap));
  const y0 = opts.y0 ?? (h.worktopH + h.wallGap);
  carcass({
    x0: x, y0, z0: 0, W: w, H, D: opts.D || p.wallDepth, T: t, mat: p.mat, color: p.color,
    doorMat: p.doorMat, doorColor: p.doorColor, doorT: T(lib, p.doorMat), doorEdge: p.doorEdge,
    backMat: p.backMat, backT: T(lib, p.backMat), top: 'full', visibleBottom: true,
    sections: [{ shelves: opts.shelves ?? (H > 600 ? 2 : 1), doors: opts.doors ?? 'auto', open: !!opts.open }], gap: p.gap, prefix,
  }, out, lib);
  addHw(out, 'wallHanger', 1);
  return { H, y0 };
}

function worktop(p, lib, out, x, len, prefix) {
  if (!p.worktop || len <= 0) return;
  const wt = sheetOf(lib, p.worktopMat);
  const depth = p.depth + T(lib, p.doorMat) + 20;
  const sp = splitToFit(len, depth, wt, lib.settings.trim);
  const h = kitchenHeights(p);
  for (let k = 0; k < sp.pieces; k++) {
    out.panels.push(panel(`${prefix}Worktop${sp.pieces > 1 ? ` ${k + 1}/${sp.pieces}` : ''}`, {
      mat: p.worktopMat, color: p.worktopColor, L: sp.L, W: depth, eL: 1, eW: 0, edge: 'wide', role: 'worktop',
      box: { x: x + k * sp.L, y: h.worktopH - p.worktopT, z: 0, w: sp.L, h: p.worktopT, d: depth }, explode: [0, 2, 0],
    }));
  }
  if (sp.pieces > 1) out.notes.push(`Worktop longer than one board: ${sp.pieces} pieces, joined with worktop connector bolts.`);
}

function plinthBoard(p, lib, out, x, len, prefix) {
  if (!p.plinth || len <= 0) return;
  const sh = sheetOf(lib, p.mat);
  const sp = splitToFit(len, p.plinth - 3, sh, lib.settings.trim);
  for (let k = 0; k < sp.pieces; k++) {
    out.panels.push(panel(`${prefix}Plinth (kick board)`, {
      mat: p.doorMat, color: p.doorColor, L: sp.L, W: p.plinth - 3, eL: 1, edge: 'thick', role: 'plinth',
      box: { x: x + k * sp.L, y: 0, z: p.depth - 50 - T(lib, p.doorMat), w: sp.L, h: p.plinth - 3, d: T(lib, p.doorMat) }, explode: [0, -1, 1],
    }));
  }
}

const KITCHEN_COMMON = (o = {}) => [
  sel('standard', 'Height standard', o.standard || 'std', [['std', 'Standard (900 mm worktop)'], ['low', 'Low (850 mm worktop)'], ['comfort', 'Comfort: fitted to the cook (improved)'], ['custom', 'Custom heights']], { section: 'Standard', help: 'Comfort sets the worktop at about 52.5% of the main cook’s height, and raises the wall cabinets so they are easier to see under and reach.' }),
  num('cookH', 'Main cook’s height', 1700, { min: 1400, max: 2000, section: 'Standard', when: (p) => p.standard === 'comfort' }),
  num('worktopH', 'Worktop height', 900, { min: 750, max: 1050, section: 'Standard', when: (p) => p.standard === 'custom' }),
  num('wallGap', 'Gap worktop → wall cabinets', 550, { min: 400, max: 800, section: 'Standard', when: (p) => p.standard === 'custom' }),
  num('wallTop', 'Top of wall cabinets', 2200, { min: 1600, max: 2700, section: 'Standard', when: (p) => p.standard === 'custom' }),
  num('ceiling', 'Ceiling height', 2700, { min: 2000, max: 4000, section: 'Standard' }),
  num('depth', 'Base cabinet depth', 560, { min: 300, max: 700, section: 'Construction' }),
  num('wallDepth', 'Wall cabinet depth', 320, { min: 250, max: 450, section: 'Construction' }),
  num('plinth', 'Plinth / leg height', 100, { min: 0, max: 200, section: 'Construction' }),
  num('worktopT', 'Worktop thickness', 38, { min: 12, max: 60, section: 'Construction' }),
  num('gap', 'Gap around doors', 3, { min: 1, max: 6, section: 'Construction' }),
  cnt('shelves', 'Shelves per cabinet', 1, { max: 6, section: 'Construction' }),
  sel('doors', 'Doors per cabinet', 'auto', [['auto', 'Automatic (by width)'], ['1', '1'], ['2', '2'], ['0', 'None']], { section: 'Construction' }),
  cnt('drawers', 'Drawers in a drawer unit', 3, { min: 1, max: 6, section: 'Construction' }),
  bool('worktop', 'Include the worktop', true, { section: 'Construction' }),
  mat('worktopMat', 'Worktop board', 'wt38', { section: 'Materials & colors', when: (p) => p.worktop }),
  color('worktopColor', 'Worktop color', 'anthracite', { section: 'Materials & colors', when: (p) => p.worktop }),
  ...MATERIAL_PARAMS(o),
];

export const MODELS = {};

MODELS.kitchenRun = {
  name: 'Kitchen (plan from wall length)', icon: '🍳', group: 'Kitchen',
  desc: 'Give the length of your wall: it fills it with standard cabinets, sink, cooker and fridge spaces, plus wall cabinets.',
  params: [
    num('wallLen', 'Wall length', 3000, { min: 900, max: 8000, section: 'Your space' }),
    sel('fridge', 'Fridge space', 'right', [['none', 'No fridge here'], ['left', 'At the left end'], ['right', 'At the right end']], { section: 'Your space' }),
    num('fridgeW', 'Fridge space width', 700, { min: 550, max: 1000, section: 'Your space', when: (p) => p.fridge !== 'none' }),
    bool('sink', 'Sink cabinet', true, { section: 'Your space' }),
    num('sinkW', 'Sink cabinet width', 800, { min: 500, max: 1200, section: 'Your space', when: (p) => p.sink }),
    bool('cooker', 'Space for a cooker', true, { section: 'Your space' }),
    num('cookerW', 'Cooker width', 600, { min: 500, max: 900, section: 'Your space', when: (p) => p.cooker }),
    bool('walls', 'Wall cabinets', true, { section: 'Your space' }),
    ...KITCHEN_COMMON(),
  ],
  presets: {
    'Standard kitchen': { standard: 'std' },
    'Comfort (fitted to the cook)': { standard: 'comfort', cookH: 1700 },
    'Small / low kitchen': { standard: 'low', wallDepth: 300, depth: 500 },
  },
  // Choose base cabinet widths that fill the free length (standard widths, mostly 600)
  plan(p) {
    const fixed = (p.fridge !== 'none' ? p.fridgeW : 0) + (p.sink ? p.sinkW : 0) + (p.cooker ? p.cookerW : 0);
    let free = p.wallLen - fixed;
    const widths = [600, 500, 450, 400, 300];
    // dynamic programming over 50 mm steps: least leftover, then fewest cabinets
    const N = Math.max(0, Math.floor(free / 50));
    const best = Array(N + 1).fill(null);
    best[0] = [];
    for (let i = 1; i <= N; i++) {
      for (const w of widths) {
        const j = i - w / 50;
        if (j >= 0 && best[j] && (!best[i] || best[j].length + 1 < best[i].length || (best[j].length + 1 === best[i].length && w === 600))) best[i] = [...best[j], w];
      }
    }
    let k = N;
    while (k > 0 && !best[k]) k--;
    const units = (best[k] || []).sort((a, b) => b - a);
    const filler = free - k * 50;
    const mods = [];
    if (p.fridge === 'left') mods.push({ type: 'fridge', w: p.fridgeW });
    const half = Math.ceil(units.length / 2);
    const A = units.slice(0, half);
    const B = units.slice(half);
    // the drawer unit (next to the cooker) gets the widest cabinet: narrow drawers are not useful
    const all = [...A, ...B];
    const wi = all.indexOf(Math.max(...all.filter((w) => w >= 400), -1));
    let drawerW = null;
    if (wi >= 0) { drawerW = all[wi]; if (wi < A.length) A.splice(wi, 1); else B.splice(wi - A.length, 1); }
    A.forEach((w) => mods.push({ type: 'doors', w }));
    if (p.sink) mods.push({ type: 'sink', w: p.sinkW });
    if (drawerW) mods.push({ type: 'drawers', w: drawerW });
    if (p.cooker) mods.push({ type: 'cooker', w: p.cookerW });
    B.forEach((w) => mods.push({ type: 'doors', w }));
    if (filler >= 150) mods.push({ type: 'open', w: filler });
    else if (filler > 0) mods.push({ type: 'filler', w: filler });
    if (p.fridge === 'right') mods.push({ type: 'fridge', w: p.fridgeW });
    if (!p.cooker && !p.sink && mods.length > 1 && !mods.some((m) => m.type === 'drawers')) {
      const i = mods.findIndex((m) => m.type === 'doors');
      if (i >= 0) mods[i].type = 'drawers';
    }
    return mods;
  },
  build(p, lib) {
    const out = newOut();
    const h = kitchenHeights(p);
    const mods = this.plan(p);
    let x = 0;
    let segStart = 0;
    const segs = [];
    const labels = { doors: 'Door cabinet', drawers: 'Drawer unit', sink: 'Sink cabinet', open: 'Open shelf unit', filler: 'Filler', cooker: 'Cooker space', fridge: 'Fridge space' };
    let n = 0;
    for (const m of mods) {
      const gap = m.type === 'fridge' || m.type === 'cooker';
      if (gap) {
        if (x > segStart) segs.push([segStart, x]);
        segStart = x + m.w;
      } else if (m.type === 'filler') {
        out.panels.push(panel(`Filler strip ${Math.round(m.w)} mm`, { mat: p.doorMat, color: p.doorColor, L: h.worktopH - p.worktopT - p.plinth, W: m.w, eL: 1, edge: 'thick', role: 'door', box: { x, y: p.plinth, z: p.depth, w: m.w, h: h.worktopH - p.worktopT - p.plinth, d: T(lib, p.doorMat) } }));
      } else {
        n++;
        baseUnit(p, lib, out, x, m.w, m.type, `B${n} ${labels[m.type]} ${m.w}`, h);
      }
      // wall cabinets above
      if (p.walls) {
        if (m.type === 'cooker') wallUnit(p, lib, out, x, m.w, `W hood cabinet ${m.w}`, h, { H: 360, y0: h.wallTop - 360, shelves: 0 });
        else if (m.type === 'fridge') wallUnit(p, lib, out, x, m.w, `W above fridge ${m.w}`, h, { H: 400, y0: h.wallTop - 400, shelves: 0 });
        else if (m.type === 'filler') out.panels.push(panel(`Wall filler strip ${Math.round(m.w)} mm`, { mat: p.doorMat, color: p.doorColor, L: h.wallTop - h.worktopH - h.wallGap, W: m.w, eL: 1, edge: 'thick', role: 'door', box: { x, y: h.worktopH + h.wallGap, z: p.wallDepth, w: m.w, h: h.wallTop - h.worktopH - h.wallGap, d: T(lib, p.doorMat) } }));
        else {
          // wall cabinets wider than 600 mm are split in two: shorter shelves don't sag, doors stay small
          const parts = m.w > 600 ? Math.ceil(m.w / 600) : 1;
          for (let q = 0; q < parts; q++) wallUnit(p, lib, out, x + (q * m.w) / parts, m.w / parts, `W${n}${parts > 1 ? String.fromCharCode(97 + q) : ''} Wall cabinet ${Math.round(m.w / parts)}`, h, { open: m.type === 'open' });
        }
      }
      x += m.w;
    }
    if (x > segStart) segs.push([segStart, x]);
    segs.forEach(([a, b], i) => { worktop(p, lib, out, a, b - a, segs.length > 1 ? `Run ${i + 1} · ` : ''); plinthBoard(p, lib, out, a, b - a, segs.length > 1 ? `Run ${i + 1} · ` : ''); });
    out.size = { w: x, h: p.walls ? h.wallTop : h.worktopH, d: p.depth };
    out.layout = mods.map((m) => `${labels[m.type]} ${Math.round(m.w)}`);
    out.notes.unshift(`Layout (left → right): ${out.layout.join(' · ')}.`);
    out.notes.unshift(`Worktop height ${h.worktopH} mm · wall cabinets from ${h.worktopH + h.wallGap} to ${h.wallTop} mm above the floor.`);
    if (p.cooker) out.notes.push('Keep at least 650 mm between the hob and the bottom of the hood cabinet / extractor.');
    if (Math.abs(x - p.wallLen) > 1) out.warnings.push(`Cabinets fill ${x} mm of your ${p.wallLen} mm wall.`);
    if (h.wallGap < 500) out.warnings.push('Less than 500 mm between worktop and wall cabinets is cramped for most appliances.');
    return out;
  },
};

MODELS.kitchenBase = {
  name: 'Kitchen base cabinet', icon: '🗄️', group: 'Kitchen',
  desc: 'Floor cabinet under the worktop: doors, drawers, door + drawer, sink or open.',
  params: [
    num('width', 'Width', 600, { min: 150, max: 1200, section: 'Size', help: 'Standard widths: 300, 400, 450, 500, 600, 800, 900, 1000.' }),
    sel('kind', 'Type', 'doors', [['doors', 'Doors + shelves'], ['drawers', 'Drawer unit'], ['mixed', 'Drawer on top + doors'], ['sink', 'Sink cabinet'], ['open', 'Open shelves']], { section: 'Size' }),
    ...KITCHEN_COMMON().filter((x) => !['ceiling', 'wallDepth', 'wallGap', 'wallTop'].includes(x.k)),
  ],
  presets: { 'Base 600 with doors': { width: 600, kind: 'doors' }, 'Drawer unit 600': { width: 600, kind: 'drawers', drawers: 3 }, 'Sink base 800': { width: 800, kind: 'sink' }, 'Narrow 300': { width: 300, kind: 'doors' } },
  build(p, lib) {
    const out = newOut();
    const h = kitchenHeights({ ...p, ceiling: 2700 });
    const H = baseUnit(p, lib, out, 0, p.width, p.kind, '', h);
    worktop(p, lib, out, 0, p.width, '');
    plinthBoard(p, lib, out, 0, p.width, '');
    out.size = { w: p.width, h: h.worktopH, d: p.depth };
    out.notes.unshift(`Carcass height ${Math.round(H)} mm + plinth ${p.plinth} mm + worktop ${p.worktopT} mm = ${h.worktopH} mm.`);
    return out;
  },
};

MODELS.kitchenWall = {
  name: 'Kitchen wall cabinet', icon: '🧰', group: 'Kitchen',
  desc: 'Hanging cabinet above the worktop.',
  params: [
    num('width', 'Width', 600, { min: 150, max: 1200, section: 'Size' }),
    num('height', 'Height', 720, { min: 250, max: 1200, section: 'Size', help: 'Common: 360 (above hood/fridge), 600, 720, 900.' }),
    num('wallDepth', 'Depth', 320, { min: 200, max: 450, section: 'Size' }),
    num('mountH', 'Bottom height from floor', 1450, { min: 1200, max: 2000, section: 'Size', help: 'Worktop 900 + 550 gap = 1450.' }),
    cnt('shelves', 'Shelves', 2, { max: 6, section: 'Size' }),
    sel('doors', 'Doors', 'auto', [['auto', 'Automatic (by width)'], ['1', '1'], ['2', '2'], ['0', 'None (open)']], { section: 'Size' }),
    num('gap', 'Gap around doors', 3, { min: 1, max: 6, section: 'Construction' }),
    ...MATERIAL_PARAMS(),
  ],
  presets: { 'Wall 600 × 720': { width: 600, height: 720 }, 'Wall 800 × 720 (2 doors)': { width: 800, height: 720, doors: 'auto' }, 'Above hood 600 × 360': { width: 600, height: 360, shelves: 0 }, 'Tall wall 600 × 900': { width: 600, height: 900, shelves: 3 } },
  build(p, lib) {
    const out = newOut();
    wallUnit(p, lib, out, 0, p.width, '', null, { H: p.height, y0: p.mountH, D: p.wallDepth, shelves: p.shelves, doors: p.doors === 'auto' ? 'auto' : Number(p.doors), open: p.doors === '0' });
    out.size = { w: p.width, h: p.mountH + p.height, d: p.wallDepth };
    return out;
  },
};

MODELS.kitchenTall = {
  name: 'Tall cabinet / pantry', icon: '🚪', group: 'Kitchen',
  desc: 'Floor-to-top storage with lower and upper doors.',
  params: [
    num('width', 'Width', 600, { min: 300, max: 1200, section: 'Size' }),
    num('height', 'Total height (with plinth)', 2100, { min: 1400, max: 2700, section: 'Size' }),
    num('depth', 'Depth', 560, { min: 300, max: 700, section: 'Size' }),
    num('plinth', 'Plinth / legs', 100, { min: 0, max: 200, section: 'Size' }),
    num('split', 'Lower doors height', 1300, { min: 400, max: 2000, section: 'Size', help: 'A fixed shelf sits where the lower and upper doors meet.' }),
    cnt('shelves', 'Adjustable shelves', 4, { max: 10, section: 'Size' }),
    num('gap', 'Gap around doors', 3, { min: 1, max: 6, section: 'Construction' }),
    ...MATERIAL_PARAMS(),
  ],
  presets: { 'Pantry 600': { width: 600, height: 2100 }, 'Broom cupboard 450': { width: 450, height: 2100, shelves: 2 } },
  build(p, lib) {
    const out = newOut();
    const t = T(lib, p.mat);
    const H = p.height - p.plinth;
    carcass({ x0: 0, y0: p.plinth, z0: 0, W: p.width, H, D: p.depth, T: t, mat: p.mat, color: p.color, doorMat: p.doorMat, doorColor: p.doorColor, doorT: T(lib, p.doorMat), doorEdge: p.doorEdge, backMat: p.backMat, backT: T(lib, p.backMat), top: 'full', sections: [{ shelves: p.shelves, split: Math.min(H - 200, p.split - p.plinth) }], gap: p.gap }, out, lib);
    plinthBoard({ ...p, worktop: false }, lib, out, 0, p.width, '');
    addHw(out, 'legKitchen', 4);
    addHw(out, 'wallAnchor', 2);
    out.size = { w: p.width, h: p.height, d: p.depth };
    out.notes.push('Fix tall cabinets to the wall with anti-tip anchors.');
    return out;
  },
};

/* ================================================================ BEDS */

const BED_SIZES = Object.entries(MATTRESS).map(([k, m]) => [k, `${m.name} · ${m.w / 10}×${m.l / 10} cm`]);

export function nightstand(p, lib, out, x, z0, name, yFloor = 0) {
  const t = T(lib, p.nsMat || p.mat);
  const W = p.nsW;
  const D = p.nsD;
  const H = p.nsH;
  const legs = p.nsBase === 'legs' ? p.nsLegH : 0;
  const plinth = p.nsBase === 'plinth' ? 60 : 0;
  const floating = p.nsBase === 'floating';
  // floating: a box hung so its top is at nsMount (on a bed: level with the mattress top)
  const boxH = floating ? (p.nsFloatH || Math.min(H, 280)) : H - legs - plinth;
  const y0 = floating ? yFloor + p.nsMount - boxH : legs + plinth;
  carcass({
    x0: x, y0, z0, W, H: boxH, D, T: t, mat: p.nsMat || p.mat, color: p.nsColor || p.color,
    doorMat: p.nsMat || p.mat, doorColor: p.nsFront || p.nsColor || p.color, doorT: t, doorEdge: 'thick',
    backMat: 'hdf3', backT: 3, top: 'over', visibleBottom: floating,
    sections: [{ drawers: p.nsDrawers, drawerPos: 'top', drawerH: p.nsDrawers > 1 ? (boxH - 2 * t) / p.nsDrawers : 160, drawerFill: p.nsDrawers > 1 && !p.nsShelf, shelves: p.nsShelf && boxH > 320 ? 1 : 0, open: true }],
    prefix: name,
  }, out, lib);
  if (plinth) out.panels.push(panel(`${name} · Plinth`, { mat: p.nsMat || p.mat, color: p.nsColor || p.color, L: W - 2 * t, W: plinth, role: 'plinth', box: { x: x + t, y: 0, z: z0 + D - 30 - t, w: W - 2 * t, h: plinth, d: t } }));
  if (legs) { addHw(out, 'bedLeg', 4); out.legs.push(...[[x + 30, z0 + 30], [x + W - 30, z0 + 30], [x + 30, z0 + D - 30], [x + W - 30, z0 + D - 30]].map(([lx, lz]) => ({ x: lx, z: lz, h: legs, y: 0 }))); }
  if (floating) out.notes.push(`${name}: floating. Hang it on the headboard or wall with a French cleat, bottom at ${Math.round(y0)} mm.`);
}

MODELS.bed = {
  name: 'Bed', icon: '🛏️', group: 'Bedroom',
  desc: 'Single, twin, joinable twins, double, queen, king: rails, plywood/board deck on metal bars or slats, headboard, footboard, nightstands.',
  params: [
    sel('size', 'Mattress size', 'queen', [...BED_SIZES, ['custom', 'Custom size']], { section: 'Size' }),
    num('mW', 'Mattress width', 1600, { min: 600, max: 2400, section: 'Size', when: (p) => p.size === 'custom' }),
    num('mL', 'Mattress length', 2000, { min: 1500, max: 2400, section: 'Size', when: (p) => p.size === 'custom' }),
    num('mT', 'Mattress thickness', 220, { min: 80, max: 400, section: 'Size' }),
    sel('count', 'Beds', '1', [['1', 'One bed'], ['2', 'Two twins that join into one (zip & link)']], { section: 'Size', help: 'Two twin frames side by side with connector brackets: use them apart as twins or joined as a king.' }),
    num('clear', 'Space around the mattress', 10, { min: 0, max: 40, section: 'Frame' }),
    num('railH', 'Rail height', 260, { min: 120, max: 450, section: 'Frame' }),
    cnt('railLayers', 'Rail board layers', 2, { min: 1, max: 3, section: 'Frame', help: '2 layers (36 mm) makes strong rails for heavy hotel use.' }),
    num('legH', 'Height under the rails (legs)', 120, { min: 0, max: 400, section: 'Frame', help: '0 = rails sit on the floor (easy to clean, nothing falls under).' }),
    num('recess', 'Mattress sits below the rail top by', 60, { min: 0, max: 200, section: 'Frame' }),
    sel('deck', 'Mattress support', 'board', [['board', 'Board deck (plywood / MDF / chipboard)'], ['slats', 'Wooden slats']], { section: 'Frame' }),
    mat('deckMat', 'Deck board', 'ply18', { section: 'Frame', when: (p) => p.deck === 'board' }),
    sel('support', 'Supports under the deck', 'metal', [['metal', 'Steel angle bars (40×40)'], ['wood', 'Timber battens (45×70)'], ['none', 'None: deck rests on the holders only']], { section: 'Frame' }),
    sel('duty', 'Use', 'hotel', [['home', 'Home'], ['hotel', 'Hotel / heavy use (closer supports)']], { section: 'Frame' }),
    num('ledgerH', 'Deck holder strip height', 50, { min: 30, max: 100, section: 'Frame', help: 'Strips screwed and glued inside the rails. The supports rest on them, and the deck rests on the supports.' }),
    sel('head', 'Headboard', 'standard', [['none', 'None'], ['low', 'Low (900 mm)'], ['standard', 'Standard (1100 mm)'], ['tall', 'Tall (1300 mm)'], ['hotel', 'Hotel tall (1500 mm)'], ['custom', 'Custom height']], { section: 'Headboard & footboard' }),
    num('headH', 'Headboard height from floor', 1100, { min: 600, max: 2400, section: 'Headboard & footboard', when: (p) => p.head === 'custom' }),
    sel('headWidth', 'Headboard width', 'bed', [['bed', 'Same as the bed'], ['over', 'Bed + 50 mm each side'], ['wide', 'Wide: also behind the nightstands']], { section: 'Headboard & footboard' }),
    cnt('headLayers', 'Headboard layers', 1, { min: 1, max: 2, section: 'Headboard & footboard' }),
    bool('padded', 'Padded panel on the headboard', false, { section: 'Headboard & footboard' }),
    bool('shared', 'One headboard across both twins', true, { section: 'Headboard & footboard', when: (p) => p.count === '2' }),
    sel('foot', 'Footboard', 'none', [['none', 'None'], ['low', 'Low (rail + 50 mm)'], ['high', 'High (rail + 250 mm)']], { section: 'Headboard & footboard' }),
    sel('ns', 'Nightstands', 'both', [['none', 'None'], ['left', 'Left'], ['right', 'Right'], ['both', 'Both sides']], { section: 'Nightstands' }),
    sel('nsHeight', 'Nightstand height', 'auto', [['auto', 'Automatic: level with the mattress top'], ['custom', 'Custom']], { section: 'Nightstands', when: (p) => p.ns !== 'none' }),
    num('nsHc', 'Nightstand height', 550, { min: 300, max: 900, section: 'Nightstands', when: (p) => p.ns !== 'none' && p.nsHeight === 'custom' }),
    num('nsW', 'Nightstand width', 450, { min: 250, max: 800, section: 'Nightstands', when: (p) => p.ns !== 'none' }),
    num('nsD', 'Nightstand depth', 400, { min: 250, max: 600, section: 'Nightstands', when: (p) => p.ns !== 'none' }),
    num('nsGap', 'Gap to the bed', 30, { min: 0, max: 300, section: 'Nightstands', when: (p) => p.ns !== 'none' }),
    sel('nsBase', 'Nightstand base', 'legs', [['legs', 'Legs'], ['plinth', 'Plinth'], ['floating', 'Floating (hung, no legs)']], { section: 'Nightstands', when: (p) => p.ns !== 'none' }),
    num('nsLegH', 'Nightstand leg height', 120, { min: 50, max: 300, section: 'Nightstands', when: (p) => p.ns !== 'none' && p.nsBase === 'legs' }),
    cnt('nsDrawers', 'Drawers', 1, { max: 3, section: 'Nightstands', when: (p) => p.ns !== 'none' }),
    bool('nsShelf', 'Open shelf under the drawer', true, { section: 'Nightstands', when: (p) => p.ns !== 'none' }),
    mat('mat', 'Frame board', 'mdf18', { section: 'Materials & colors' }),
    color('color', 'Frame color', 'walnut', { section: 'Materials & colors' }),
    color('headColor', 'Headboard color', 'walnut', { section: 'Materials & colors' }),
    color('nsColor', 'Nightstand color', 'walnut', { section: 'Materials & colors' }),
    color('nsFront', 'Drawer front color', 'cream', { section: 'Materials & colors' }),
  ],
  presets: {
    'Hotel queen (1600×2000)': { size: 'queen', count: '1', duty: 'hotel', head: 'hotel', headWidth: 'wide', ns: 'both', legH: 0 },
    'Hotel twin (1000×2000)': { size: 'twin', count: '1', duty: 'hotel', head: 'standard', ns: 'left', legH: 0 },
    'Joinable twins → king (2× 900×2000)': { size: 'single200', count: '2', duty: 'hotel', head: 'tall', shared: true, ns: 'both', legH: 0 },
    'Hotel king suite (1800×2000)': { size: 'king', count: '1', duty: 'hotel', head: 'hotel', headWidth: 'wide', padded: true, ns: 'both', legH: 0 },
    'Home single (900×1900)': { size: 'single', count: '1', duty: 'home', head: 'low', ns: 'right', deck: 'slats', support: 'none' },
    'Home double (1400×1900)': { size: 'double', count: '1', duty: 'home', head: 'standard', ns: 'both' },
  },
  build(p, lib) {
    const out = newOut();
    const m = p.size === 'custom' ? { w: p.mW, l: p.mL, name: 'Custom' } : MATTRESS[p.size];
    const t = T(lib, p.mat);
    const rt = t * p.railLayers;
    const iW = m.w + 2 * p.clear;
    const iL = m.l + 2 * p.clear;
    const OW = iW + 2 * rt;
    const OL = iL + 2 * rt;
    const count = p.count === '2' ? 2 : 1;
    const railTop = p.legH + p.railH;
    const deckTop = railTop - p.recess;
    const mattressTop = deckTop + p.mT;
    const deckMat = sheetOf(lib, p.deckMat);
    const deckT = p.deck === 'board' ? deckMat.T : 18;
    const bh = p.support === 'metal' ? 40 : p.support === 'wood' ? 45 : 0;
    const supportBottom = deckTop - deckT - bh;
    const nsOn = p.ns !== 'none';
    const nsH = p.nsHeight === 'custom' ? p.nsHc : r5(mattressTop);
    const headH = { low: 900, standard: 1100, tall: 1300, hotel: 1500, custom: p.headH }[p.head] || 0;
    const hbT = t * p.headLayers;
    const nsLeft = p.ns === 'left' || p.ns === 'both';
    const nsRight = p.ns === 'right' || p.ns === 'both';

    // ---- one frame
    const frame = (x0, label) => {
      const pre = label ? `${label} · ` : '';
      const P = (name, o) => out.panels.push(panel(pre + name, { mat: p.mat, color: p.color, group: label || 'Bed', ...o }));
      for (let layer = 0; layer < p.railLayers; layer++) {
        const lname = p.railLayers > 1 ? ` (layer ${layer + 1})` : '';
        P('Side rail' + lname, { L: OL, W: p.railH, eL: layer === 0 ? 2 : 0, eW: layer === 0 ? 2 : 0, role: 'rail', box: { x: x0 + layer * t, y: p.legH, z: 0, w: t, h: p.railH, d: OL }, explode: [-1, 0, 0] });
        P('Side rail' + lname, { L: OL, W: p.railH, eL: layer === 0 ? 2 : 0, eW: layer === 0 ? 2 : 0, role: 'rail', box: { x: x0 + OW - t - layer * t, y: p.legH, z: 0, w: t, h: p.railH, d: OL }, explode: [1, 0, 0] });
        P('Head rail' + lname, { L: iW, W: p.railH, eL: layer === 0 ? 1 : 0, role: 'rail', box: { x: x0 + rt, y: p.legH, z: layer * t, w: iW, h: p.railH, d: t }, explode: [0, 0, -1] });
        P('Foot rail' + lname, { L: iW, W: p.railH, eL: layer === 0 ? 2 : 0, role: 'rail', box: { x: x0 + rt, y: p.legH, z: OL - t - layer * t, w: iW, h: p.railH, d: t }, explode: [0, 0, 1] });
      }
      // deck holders (ledger strips) inside the side rails, and at head/foot for board decks
      const ledTop = p.support === 'none' ? deckTop - deckT : supportBottom;
      P('Deck holder (long)', { L: iL, W: p.ledgerH, role: 'rail', box: { x: x0 + rt, y: ledTop - p.ledgerH, z: rt, w: t, h: p.ledgerH, d: iL }, explode: [-0.5, 0, 0] });
      P('Deck holder (long)', { L: iL, W: p.ledgerH, role: 'rail', box: { x: x0 + OW - rt - t, y: ledTop - p.ledgerH, z: rt, w: t, h: p.ledgerH, d: iL }, explode: [0.5, 0, 0] });
      if (p.deck === 'board') {
        const deckLedTop = deckTop - deckT;
        P('Deck holder (end)', { L: iW - 2 * t, W: p.ledgerH, role: 'rail', box: { x: x0 + rt + t, y: deckLedTop - p.ledgerH, z: rt, w: iW - 2 * t, h: p.ledgerH, d: t }, explode: [0, 0, -0.5] });
        P('Deck holder (end)', { L: iW - 2 * t, W: p.ledgerH, role: 'rail', box: { x: x0 + rt + t, y: deckLedTop - p.ledgerH, z: OL - rt - t, w: iW - 2 * t, h: p.ledgerH, d: t }, explode: [0, 0, 0.5] });
      }
      addHw(out, 'screw', Math.ceil(iL / 150) * 2 + 8);
      addHw(out, 'bedBolt', 4);

      // ---- deck pieces (joints always land on a support)
      const maxSpan = (p.duty === 'hotel' ? 400 : 500) * (deckT >= 18 ? 1 : deckT >= 15 ? 0.85 : 0.7);
      const joints = [];
      if (p.deck === 'board') {
        const sp = splitToFit(iW - 4, iL - 4, deckMat, lib.settings.trim);
        const acrossPieces = sp.along === 'L' ? sp.pieces : 1;
        const alongPieces = sp.along === 'W' ? sp.pieces : 1;
        const pw = (iW - 4) / acrossPieces;
        const pl = (iL - 4) / alongPieces;
        for (let a = 0; a < acrossPieces; a++) for (let b = 0; b < alongPieces; b++) {
          out.panels.push(panel(pre + 'Deck panel', { mat: p.deckMat, color: 'ply', L: Math.max(pw, pl), W: Math.min(pw, pl), role: 'deck', grain: false, group: label || 'Bed', box: { x: x0 + rt + 2 + a * pw, y: deckTop - deckT, z: rt + 2 + b * pl, w: pw, h: deckT, d: pl }, explode: [0, 1.5, 0] }));
        }
        for (let b = 1; b < alongPieces; b++) joints.push(rt + 2 + b * pl);
        if (acrossPieces > 1) out.notes.push(`${pre}Deck split down the middle: the center beam supports the joint.`);
        out.notes.push(`${pre}Drill Ø30 mm air holes about every 300 mm in the deck so the mattress can breathe. Paint the underside with dirt-resistant paint for easy cleaning.`);
      }

      // ---- supports across the width (metal angle or timber battens)
      const supports = [];
      if (p.support !== 'none') {
        const nb = Math.max(1, Math.ceil(iL / maxSpan) - 1);
        for (let k = 1; k <= nb; k++) supports.push(rt + (iL * k) / (nb + 1));
        for (const j of joints) if (!supports.some((z) => Math.abs(z - j) < 60)) supports.push(j);
        supports.sort((a, b) => a - b);
        const len = iW - 2 * t - 5;
        const key = p.support === 'metal' ? 'metalBar' : 'batten';
        out.linear.push({ key, name: `${pre}${p.support === 'metal' ? 'Steel angle 40×40×4' : 'Timber batten 45×70'} across the bed`, len, qty: supports.length });
        supports.forEach((z) => out.bars.push({ x: x0 + rt + t + 2.5, y: supportBottom, z: z - 20, w: len, h: bh, d: 40, kind: p.support }));
        out.notes.push(`${pre}${supports.length} supports across the bed, ${Math.round(len)} mm long, resting on the holder strips. Centres at ${supports.map((z) => Math.round(z)).join(', ')} mm from the head end. Largest gap ${Math.round(Math.max(...supports.map((z, i) => z - (i ? supports[i - 1] : rt)), OL - rt - supports[supports.length - 1]))} mm.`);
      }
      // center beam for wide beds
      if (iW > 1300) {
        const len = iL - 10;
        out.linear.push({ key: p.support === 'wood' ? 'batten' : 'metalBox', name: `${pre}Center beam (lengthwise)`, len, qty: 1 });
        out.bars.push({ x: x0 + OW / 2 - 20, y: supportBottom - (p.support === 'none' ? 0 : 40), z: rt + 5, w: 40, h: 40, d: len, kind: p.support === 'wood' ? 'wood' : 'metal' });
        const cl = iL > 1600 ? 2 : 1;
        addHw(out, 'bedLeg', cl);
        for (let k = 1; k <= cl; k++) out.legs.push({ x: x0 + OW / 2, z: rt + (iL * k) / (cl + 1), h: Math.max(0, supportBottom - 40), y: 0, metal: true });
        out.notes.push(`${pre}Center beam with ${cl} support leg${cl > 1 ? 's' : ''} to the floor (wide beds sag in the middle without it).`);
      }
      // slats
      if (p.deck === 'slats') {
        const gap = 55;
        const nsl = Math.floor(iL / (70 + gap));
        const slatLen = iW > 1300 ? (iW - 2 * t) / 2 - 10 : iW - 2 * t - 5;
        const rows = iW > 1300 ? 2 : 1;
        out.linear.push({ key: 'slat', name: `${pre}Slats 70×18`, len: slatLen, qty: nsl * rows });
        for (let k = 0; k < nsl; k++) for (let r = 0; r < rows; r++) out.bars.push({ x: x0 + rt + t + 2 + r * (slatLen + 20), y: deckTop - 18, z: rt + 30 + k * (70 + gap), w: slatLen, h: 18, d: 70, kind: 'wood' });
        out.notes.push(`${pre}${nsl * rows} slats, ${Math.round(slatLen)} mm long, gaps ${gap} mm (keep under 70 mm).`);
      }
      // legs
      if (p.legH > 0) {
        addHw(out, 'bedLeg', 4);
        out.legs.push(...[[x0 + 40, 40], [x0 + OW - 40, 40], [x0 + 40, OL - 40], [x0 + OW - 40, OL - 40]].map(([lx, lz]) => ({ x: lx, z: lz, h: p.legH, y: 0 })));
      }
      return OW;
    };

    let totalW = 0;
    for (let b = 0; b < count; b++) {
      frame(b * OW, count === 2 ? `Twin ${b + 1}` : '');
      totalW += OW;
    }
    if (count === 2) {
      addHw(out, 'twinLink', 2);
      out.notes.push('Joining twins: bolt the inner side rails together with 2 connector brackets, 150 mm from the head and foot ends. Use a mattress zip-link or a topper to bridge the gap.');
    }

    // ---- headboard(s)
    const headZ = -hbT;
    if (p.head !== 'none') {
      const extra = p.headWidth === 'over' ? 50 : 0;
      const boards = count === 2 && !p.shared ? [[0, OW], [OW, OW]] : [[0, totalW]];
      boards.forEach(([bx, bw], bi) => {
        let left = bx - extra;
        let right = bx + bw + extra;
        if (p.headWidth === 'wide' && nsOn) {
          if (nsLeft && bi === 0) left = bx - p.nsGap - p.nsW;
          if (nsRight && bi === boards.length - 1) right = bx + bw + p.nsGap + p.nsW;
        }
        const hbW = right - left;
        const sp = splitToFit(hbW, headH, sheetOf(lib, p.mat), lib.settings.trim);
        const pieces = sp.along === 'L' ? sp.pieces : 1;
        for (let layer = 0; layer < p.headLayers; layer++) {
          for (let k = 0; k < pieces; k++) {
            const w = hbW / pieces;
            out.panels.push(panel(`Headboard${boards.length > 1 ? ` ${bi + 1}` : ''}${pieces > 1 ? ` part ${k + 1}/${pieces}` : ''}${p.headLayers > 1 ? ` (layer ${layer + 1})` : ''}`, {
              mat: p.mat, color: p.headColor, L: w, W: headH, eL: layer === 0 ? 1 : 0, eW: layer === 0 ? (pieces === 1 ? 2 : 1) : 0, edge: 'thick', role: 'head', group: 'Headboard',
              box: { x: left + k * w, y: 0, z: headZ + layer * t, w, h: headH, d: t }, explode: [0, 0, -2],
            }));
          }
        }
        if (pieces > 1) out.notes.push(`Headboard is wider than one sheet: ${pieces} parts, joined at the back with a ${Math.round(headH * 0.8)} mm batten and glue.`);
        if (p.padded) {
          const pw = Math.min(hbW - 100, (count === 2 && p.shared ? totalW : bw) - 0);
          const ph = headH - mattressTop - 80;
          if (ph > 150) {
            const sp2 = splitToFit(pw, ph, sheetOf(lib, 'mdf12'), lib.settings.trim);
            const pp = sp2.along === 'L' ? sp2.pieces : 1;
            for (let k = 0; k < pp; k++) out.panels.push(panel(`Padded panel${pp > 1 ? ` ${k + 1}/${pp}` : ''}`, { mat: 'mdf12', color: 'cream', L: pw / pp, W: ph, role: 'head', group: 'Headboard', box: { x: bx + (bw - pw) / 2 + (k * pw) / pp, y: mattressTop + 20, z: 0, w: pw / pp, h: ph, d: 50 }, explode: [0, 0, -1] }));
            out.linear.push({ key: 'foam', name: 'Foam + fabric for the padded panel', len: ((pw * ph) / 1e6) * 1000, qty: 1, area: (pw * ph) / 1e6 });
          }
        }
      });
      if (headH < mattressTop + 300) out.warnings.push(`The headboard (${headH} mm) is only ${Math.round(headH - mattressTop)} mm above the mattress top: pillows need about 300 mm or more.`);
    }

    // ---- footboard
    if (p.foot !== 'none') {
      const fh = railTop + (p.foot === 'high' ? 250 : 50);
      out.panels.push(panel('Footboard', { mat: p.mat, color: p.headColor, L: totalW, W: fh, eL: 1, eW: 2, edge: 'thick', role: 'head', group: 'Bed', box: { x: 0, y: 0, z: OL, w: totalW, h: fh, d: t }, explode: [0, 0, 2] }));
    }

    // ---- nightstands
    if (nsOn) {
      const nsp = { ...p, nsH, nsMount: mattressTop, nsMat: p.mat };
      if (nsLeft) nightstand(nsp, lib, out, -p.nsGap - p.nsW, 0, 'Nightstand (left)');
      if (nsRight) nightstand(nsp, lib, out, totalW + p.nsGap, 0, 'Nightstand (right)');
      if (Math.abs(nsH - mattressTop) > 80) out.warnings.push(`Nightstands are ${nsH} mm high, ${Math.round(nsH - mattressTop)} mm from the mattress top (${Math.round(mattressTop)} mm). Within ±50 mm is easiest to reach.`);
    }

    // summary
    out.size = { w: totalW + (nsLeft && nsOn ? p.nsW + p.nsGap : 0) + (nsRight && nsOn ? p.nsW + p.nsGap : 0), h: Math.max(headH, nsH, railTop), d: OL + hbT };
    out.offsetX = nsLeft && nsOn ? -(p.nsW + p.nsGap) : 0;
    out.notes.unshift(`${count === 2 ? 'Each twin frame' : 'Frame'}: ${Math.round(OW)} × ${Math.round(OL)} mm outside, for a ${m.w} × ${m.l} mm mattress${count === 2 ? ` (joined: ${Math.round(OW * 2)} mm wide)` : ''}. Rail top ${railTop} mm, deck top ${Math.round(deckTop)} mm, mattress top ${Math.round(mattressTop)} mm from the floor.`);
    if (p.support !== 'none' || p.deck === 'board') {
      out.notes.unshift(`Inside the rails, from the rail top down: ${p.recess} mm mattress recess → ${deckT} mm deck${bh ? ` → ${bh} mm ${p.support === 'metal' ? 'steel angle' : 'batten'}` : ''} → ${p.ledgerH} mm holder strip (its top at ${Math.round(p.support === 'none' ? deckTop - deckT : supportBottom)} mm from the floor).`);
    }
    if (supportBottom - p.ledgerH < p.legH + 5) out.warnings.push('The holder strips hang below the rails: make the rails taller, or reduce the recess.');
    if (iW > 1300 && p.legH === 0) out.notes.push('Rails sit on the floor: put the center legs on felt pads so they don’t mark the floor.');
    return out;
  },
};

/* ================================================================ STORAGE */

const SECTION_FIELDS = [
  { k: 'shelves', label: 'Shelves', type: 'num', min: 0, max: 12, def: 4 },
  { k: 'rail', label: 'Hanging rail', type: 'bool', def: false },
  { k: 'drawers', label: 'Drawers', type: 'num', min: 0, max: 6, def: 0 },
  { k: 'doors', label: 'Doors', type: 'sel', def: 'auto', opts: [['auto', 'Auto'], ['0', 'None'], ['1', '1'], ['2', '2']] },
  { k: 'hinge', label: 'Single door hinge side', type: 'sel', def: 'L', opts: [['L', 'Left'], ['R', 'Right']] },
  { k: 'adjustable', label: 'Adjustable shelves', type: 'bool', def: true },
  { k: 'share', label: 'Width share (1 = equal)', type: 'num', min: 0.2, max: 5, step: 0.1, def: 1 },
];

MODELS.cupboard = {
  name: 'Cupboard / wardrobe / bookcase', icon: '🚪', group: 'Storage',
  desc: 'Open or closed. Sections with shelves, hanging rails or drawers, doors with hinge positions.',
  params: [
    num('width', 'Width', 1200, { min: 300, max: 3600, section: 'Size' }),
    num('height', 'Height', 2100, { min: 400, max: 2700, section: 'Size' }),
    num('depth', 'Depth', 580, { min: 200, max: 800, section: 'Size', help: 'Wardrobe 550–600 (hangers need 530+). Cupboard 400–450. Bookcase 280–350.' }),
    sel('base', 'Base', 'plinth', [['plinth', 'Plinth'], ['legs', 'Legs'], ['none', 'Straight on the floor']], { section: 'Size' }),
    num('plinthH', 'Plinth / leg height', 80, { min: 0, max: 250, section: 'Size', when: (p) => p.base !== 'none' }),
    sel('style', 'Front', 'closed', [['closed', 'Closed (doors)'], ['open', 'Open (no doors)'], ['lower', 'Doors below, open above']], { section: 'Layout' }),
    num('splitH', 'Height of the lower doors', 900, { min: 300, max: 2000, section: 'Layout', when: (p) => p.style === 'lower' }),
    sel('sectionsMode', 'Sections', 'auto', [['auto', 'Automatic'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']], { section: 'Layout', help: 'Automatic adds a divider about every 900 mm so shelves don’t sag.' }),
    { k: 'sections', label: 'What goes in each section', type: 'list', fields: SECTION_FIELDS, section: 'Layout', def: [{ shelves: 4 }], help: 'Each row is a section, left to right.' },
    sel('top', 'Top', 'over', [['over', 'Top sits on the sides'], ['full', 'Top between the sides']], { section: 'Construction' }),
    num('gap', 'Gap around doors', 3, { min: 1, max: 6, section: 'Construction' }),
    num('maxDoor', 'Widest allowed door', 600, { min: 300, max: 900, section: 'Construction' }),
    ...MATERIAL_PARAMS({ color: 'sonoma', doorColor: 'sonoma' }),
  ],
  presets: {
    'Wardrobe 2-door 1000': { width: 1000, height: 2100, depth: 580, style: 'closed', sectionsMode: '1', sections: [{ rail: true, shelves: 0 }] },
    'Wardrobe 3-door 1500': { width: 1500, height: 2200, depth: 600, style: 'closed', sectionsMode: '2', sections: [{ rail: true, share: 2 }, { shelves: 5, doors: '1', hinge: 'R', share: 1 }] },
    'Wardrobe 4-door 2000': { width: 2000, height: 2200, depth: 600, style: 'closed', sectionsMode: '2', sections: [{ rail: true }, { shelves: 3, drawers: 2 }] },
    'Hotel wardrobe 900': { width: 900, height: 2000, depth: 580, style: 'closed', sectionsMode: '1', sections: [{ rail: true }] },
    'Bookcase open': { width: 900, height: 2000, depth: 300, style: 'open', sectionsMode: 'auto', sections: [{ shelves: 5 }], base: 'plinth' },
    'Cupboard closed 4 shelves': { width: 800, height: 1800, depth: 420, style: 'closed', sectionsMode: '1', sections: [{ shelves: 4 }] },
    'Display: doors below, open above': { width: 1200, height: 1900, depth: 380, style: 'lower', splitH: 850, sectionsMode: 'auto', sections: [{ shelves: 4 }] },
    'Shoe cabinet': { width: 800, height: 1000, depth: 350, style: 'closed', sectionsMode: '1', sections: [{ shelves: 4 }], base: 'legs', plinthH: 100 },
  },
  build(p, lib) {
    const out = newOut();
    const t = T(lib, p.mat);
    const base = p.base === 'none' ? 0 : p.plinthH;
    const H = p.height - base;
    const n = p.sectionsMode === 'auto' ? Math.max(1, Math.ceil((p.width - 2 * t) / Math.min(900, maxShelfSpan(sheetOf(lib, p.mat)) + 50))) : Number(p.sectionsMode);
    const list = p.sections && p.sections.length ? p.sections : [{ shelves: 4 }];
    const sections = Array.from({ length: n }, (_, i) => {
      const s = { ...SECTION_FIELDS.reduce((a, f) => ({ ...a, [f.k]: f.def }), {}), ...(list[i] || list[list.length - 1]) };
      return {
        shelves: Number(s.shelves) || 0, rail: !!s.rail, drawers: Number(s.drawers) || 0, adjustable: s.adjustable !== false,
        doors: s.doors === 'auto' ? 'auto' : Number(s.doors), hinge: s.hinge || (i === n - 1 && n > 1 ? 'R' : 'L'),
        open: p.style === 'open' || s.doors === '0',
        split: p.style === 'lower' ? p.splitH - base - t : undefined, lowerDoorsOnly: p.style === 'lower', share: Number(s.share) || 1,
      };
    });
    carcass({ x0: 0, y0: base, z0: 0, W: p.width, H, D: p.depth, T: t, mat: p.mat, color: p.color, doorMat: p.doorMat, doorColor: p.doorColor, doorT: T(lib, p.doorMat), doorEdge: p.doorEdge, backMat: p.backMat, backT: T(lib, p.backMat), top: p.top, sections, gap: p.gap, maxDoor: p.maxDoor }, out, lib);
    if (p.base === 'plinth' && base) {
      out.panels.push(panel('Plinth (front)', { mat: p.mat, color: p.color, L: p.width - 2 * t, W: base, eL: 1, role: 'plinth', box: { x: t, y: 0, z: p.depth - 40 - t, w: p.width - 2 * t, h: base, d: t }, explode: [0, -1, 0.5] }));
      out.panels.push(panel('Plinth (back)', { mat: p.mat, color: p.color, L: p.width - 2 * t, W: base, role: 'plinth', box: { x: t, y: 0, z: 40, w: p.width - 2 * t, h: base, d: t }, explode: [0, -1, -0.5] }));
    } else if (p.base === 'legs' && base) {
      addHw(out, 'legKitchen', p.width > 1000 ? 6 : 4);
      out.legs.push(...[[40, 40], [p.width - 40, 40], [40, p.depth - 40], [p.width - 40, p.depth - 40]].map(([x, z]) => ({ x, z, h: base, y: 0 })));
    }
    if (p.height > 1200) { addHw(out, 'wallAnchor', 2); out.notes.push('Tall furniture: fix it to the wall with anti-tip anchors.'); }
    if (sections.some((s) => s.rail) && p.depth < 530) out.warnings.push(`Depth ${p.depth} mm is too shallow for clothes hangers (need about 530 mm or more).`);
    out.size = { w: p.width, h: p.height, d: p.depth };
    return out;
  },
};

MODELS.nightstand = {
  name: 'Nightstand / bedside table', icon: '🪑', group: 'Bedroom',
  desc: 'With drawers and/or an open shelf, on legs, a plinth or floating.',
  params: [
    num('nsW', 'Width', 450, { min: 250, max: 800, section: 'Size' }),
    num('nsD', 'Depth', 400, { min: 250, max: 600, section: 'Size' }),
    num('nsH', 'Height', 550, { min: 300, max: 900, section: 'Size', help: 'Best within ±50 mm of the mattress top.' }),
    sel('nsBase', 'Base', 'legs', [['legs', 'Legs'], ['plinth', 'Plinth'], ['floating', 'Floating (hung on the wall)']], { section: 'Size' }),
    num('nsLegH', 'Leg height', 120, { min: 50, max: 300, section: 'Size', when: (p) => p.nsBase === 'legs' }),
    num('nsMount', 'Top height when floating', 550, { min: 300, max: 900, section: 'Size', when: (p) => p.nsBase === 'floating' }),
    cnt('nsDrawers', 'Drawers', 1, { max: 4, section: 'Layout' }),
    bool('nsShelf', 'Open shelf', true, { section: 'Layout' }),
    mat('mat', 'Board', 'mdf18', { section: 'Materials & colors' }),
    color('nsColor', 'Body color', 'walnut', { section: 'Materials & colors' }),
    color('nsFront', 'Drawer front color', 'cream', { section: 'Materials & colors' }),
  ],
  presets: { 'Classic (1 drawer + shelf)': { nsDrawers: 1, nsShelf: true, nsBase: 'legs' }, 'Chest (3 drawers)': { nsDrawers: 3, nsShelf: false, nsH: 600, nsBase: 'plinth' }, 'Floating shelf + drawer': { nsDrawers: 1, nsShelf: false, nsBase: 'floating', nsH: 200 } },
  build(p, lib) {
    const out = newOut();
    nightstand({ ...p, nsMat: p.mat, nsFloatH: p.nsH }, lib, out, 0, 0, 'Nightstand');
    out.size = { w: p.nsW, h: p.nsBase === 'floating' ? p.nsMount : p.nsH, d: p.nsD };
    return out;
  },
};

/* ================================================================ CUSTOM PARTS */

MODELS.custom = {
  name: 'Custom parts list', icon: '📐', group: 'Other',
  desc: 'Type in your own parts, like SketchCut: sizes, quantity, board, edge banding, grain.',
  params: [
    { k: 'parts', label: 'Parts', type: 'list', section: 'Parts', fields: [
      { k: 'name', label: 'Name', type: 'text', def: 'Part' },
      { k: 'L', label: 'Length', type: 'num', len: true, def: 600, min: 1 },
      { k: 'W', label: 'Width', type: 'num', len: true, def: 400, min: 1 },
      { k: 'qty', label: 'Quantity', type: 'num', def: 1, min: 1, max: 999 },
      { k: 'mat', label: 'Board', type: 'mat', def: 'mdf18' },
      { k: 'color', label: 'Color', type: 'color', def: 'white' },
      { k: 'eL', label: 'Edge band on long sides', type: 'sel', def: '0', opts: [['0', 'None'], ['1', '1 side'], ['2', '2 sides']] },
      { k: 'eW', label: 'Edge band on short sides', type: 'sel', def: '0', opts: [['0', 'None'], ['1', '1 side'], ['2', '2 sides']] },
      { k: 'edge', label: 'Edge band', type: 'sel', def: 'thin', opts: [['thin', '0.4 mm'], ['thick', '2 mm'], ['wide', '1 × 42 mm']] },
      { k: 'grain', label: 'Keep grain along the length', type: 'bool', def: false },
    ], def: [{ name: 'Panel', L: 600, W: 400, qty: 2, mat: 'mdf18', color: 'white', eL: '1', eW: '0', edge: 'thin', grain: false }] },
  ],
  presets: {},
  build(p, lib) {
    const out = newOut();
    let x = 0;
    let maxH = 0;
    (p.parts || []).forEach((r) => {
      const t = T(lib, r.mat);
      for (let q = 0; q < Math.max(1, r.qty | 0); q++) {
        out.panels.push(panel(r.name || 'Part', { mat: r.mat, color: r.color, L: Number(r.L), W: Number(r.W), eL: Number(r.eL), eW: Number(r.eW), edge: r.edge, grain: !!r.grain, role: 'carcass', box: { x, y: q * (t + 4), z: 0, w: Number(r.L), h: t, d: Number(r.W) } }));
        maxH = Math.max(maxH, (q + 1) * (t + 4));
      }
      x += Number(r.L) + 60;
    });
    out.size = { w: Math.max(0, x - 60), h: maxH, d: Math.max(0, ...(p.parts || []).map((r) => Number(r.W) || 0)) };
    return out;
  },
};

export function defaults(model) {
  const p = {};
  for (const f of model.params) p[f.k] = structuredClone(f.def);
  return p;
}

export function buildItem(item, lib) {
  const model = MODELS[item.model];
  const params = { ...defaults(model), ...item.params };
  const out = model.build(params, lib);
  return out;
}
