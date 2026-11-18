// Furniture models. Each model has adjustable settings ("params"), ready-made standards
// ("presets") and a build() that returns every panel with its cut size, edge banding and 3D position,
// plus hardware, metal/timber lengths, notes and warnings.
import { panel, r5, MATTRESS, maxShelfSpan, splitToFit, matById, roleMat, GRADES, BED_METAL, HINGE_TYPES } from './core.js';
export { splitToFit };
import { carcass } from './carcass.js';

const num = (k, label, def, o = {}) => ({ k, label, type: 'num', def, len: true, step: 1, ...o });
const cnt = (k, label, def, o = {}) => ({ k, label, type: 'num', def, len: false, step: 1, min: 0, ...o });
const sel = (k, label, def, opts, o = {}) => ({ k, label, type: 'sel', def, opts, ...o });
const bool = (k, label, def, o = {}) => ({ k, label, type: 'bool', def, ...o });
const mat = (k, label, def, o = {}) => ({ k, label, type: 'mat', def, ...o });
const color = (k, label, def, o = {}) => ({ k, label, type: 'color', def, ...o });

const newOut = () => ({ panels: [], hw: {}, linear: [], notes: [], warnings: [], size: { w: 0, h: 0, d: 0 }, rails: [], bars: [], legs: [], marks: [] });
const addHw = (out, k, n) => { out.hw[k] = (out.hw[k] || 0) + n; };
const T = (lib, id) => matById(lib, id).T;
const sheetOf = (lib, id) => matById(lib, id);

// Build grade: picking one sets the boards and hardware below (you can still change each one)
const GRADE_SETS = {
  economy: { mat: '@carcass', doorMat: '@carcass', doorEdge: 'none', backMat: '@back', frame: 'plinth' },
  medium: { mat: '@door', doorMat: '@door', doorEdge: 'thick', backMat: '@back', frame: 'legs' },
  strong: { mat: '@door', doorMat: '@door', doorEdge: 'thick', backMat: '@thin', frame: 'steel' },
};
const gradeParam = (sets = GRADE_SETS, def = 'medium') => sel('grade', 'Build grade', def, Object.entries(GRADES).map(([k, g]) => [k, g.name]), {
  section: 'Grade & hardware', sets: (v) => sets[v] || {},
  help: 'Economy = cheapest. Medium = fair for long-term use. Strong = most durable (steel frames, heavy hardware). Choosing one sets the boards and hardware; you can still change anything.',
});
const hingeParam = (def = 'full') => sel('hingeType', 'Door hinges', def, Object.entries(HINGE_TYPES).map(([k, h]) => [k, h.name]), {
  section: 'Grade & hardware', help: 'Doors that meet on a middle divider automatically get half-overlay hinges. Tap “How to fit the hinges” for drilling sizes and screws.',
});
const MATERIAL_PARAMS = (o = {}) => [
  mat('mat', 'Carcass board', o.mat || '@carcass', { section: 'Materials & colors' }),
  color('color', 'Carcass color', o.color || 'white', { section: 'Materials & colors' }),
  mat('doorMat', 'Door / front board', o.doorMat || '@door', { section: 'Materials & colors' }),
  color('doorColor', 'Door / front color', o.doorColor || 'white', { section: 'Materials & colors' }),
  sel('doorEdge', 'Door edges', 'thick', [['thick', '2 mm PVC edge band'], ['none', 'No banding (painted / lacquered)']], { section: 'Materials & colors' }),
  mat('backMat', 'Back panel', '@back', { section: 'Materials & colors', help: 'MDF 3 mm by default (no HDF). Strong grade uses 6 mm, screwed.' }),
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
    drawerMat: p.mat, hdfMat: p.backMat, top: 'rails', sections: [sec], gap: p.gap, prefix, grade: p.grade, hingeType: p.hingeType,
  }, out, lib);
  if (kind === 'sink') out.notes.push(`${prefix}: no back panel and no shelf, so pipes can pass. Seal the bottom edges against water.`);
  if (p.frame === 'legs' || !p.frame) { addHw(out, 'legKitchen', w > 900 ? 6 : 4); addHw(out, 'plinthClip', 2); }
  return H;
}

function wallUnit(p, lib, out, x, w, prefix, h, opts = {}) {
  const t = T(lib, p.mat);
  const H = opts.H ?? (h.wallTop - (h.worktopH + h.wallGap));
  const y0 = opts.y0 ?? (h.worktopH + h.wallGap);
  carcass({
    x0: x, y0, z0: 0, W: w, H, D: opts.D || p.wallDepth, T: t, mat: p.mat, color: p.color,
    doorMat: p.doorMat, doorColor: p.doorColor, doorT: T(lib, p.doorMat), doorEdge: p.doorEdge,
    backMat: p.backMat, backT: T(lib, p.backMat), top: 'full', visibleBottom: true, grade: p.grade,
    hingeType: opts.flap ? 'flap' : p.hingeType === 'flap' ? 'full' : p.hingeType,
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


// Welded steel base frame (ladder): two long tubes, cross tubes every ≤600 mm, short posts with adjustable feet
function steelBase(out, x, len, depth, height, name = '') {
  if (len <= 0 || height < 40) return;
  const tube = 30;
  const crosses = Math.max(2, Math.ceil(len / 600) + 1);
  const posts = crosses * 2;
  const postH = height - tube - 15; // 15 mm adjustable foot
  const pre = name ? name + ' · ' : '';
  out.linear.push({ key: 'shs30', name: `${pre}Base frame long tubes`, len, qty: 2 });
  out.linear.push({ key: 'shs30', name: `${pre}Base frame cross tubes`, len: depth - 2 * tube - 40, qty: crosses });
  if (postH > 0) out.linear.push({ key: 'shs30', name: `${pre}Base frame posts`, len: postH, qty: posts });
  addHw(out, 'adjFoot', posts);
  addHw(out, 'weld', 1);
  const yTop = height - tube;
  out.bars.push({ x, y: yTop, z: 20, w: len, h: tube, d: tube, kind: 'metal' });
  out.bars.push({ x, y: yTop, z: depth - 20 - tube - 30, w: len, h: tube, d: tube, kind: 'metal' });
  for (let k = 0; k < crosses; k++) {
    const cx = x + Math.min(len - tube, (k * (len - tube)) / (crosses - 1));
    out.bars.push({ x: cx, y: yTop, z: 20 + tube, w: tube, h: tube, d: depth - 2 * tube - 70, kind: 'metal' });
    if (postH > 0) for (const z of [20, depth - 50 - tube]) out.bars.push({ x: cx, y: 15, z, w: tube, h: postH, d: tube, kind: 'metal' });
  }
  out.notes.push(`${pre}Steel base frame: square tube 30×30×1.5, ${crosses} cross tubes, ${posts} posts on M10 adjustable feet. Weld, grind and paint with anti-rust primer before fitting. Screw the cabinets down through the tubes (Ø5 holes).`);
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
  gradeParam(),
  sel('frame', 'Base under the cabinets', 'legs', [['plinth', 'Plinth board on the floor'], ['legs', 'Adjustable plastic legs + plinth'], ['steel', 'Welded steel base frame 30×30 (wet floors, stone tops)']], { section: 'Grade & hardware', help: 'A steel base frame keeps MDF off wet floors and carries heavy granite or marble worktops.' }),
  hingeParam(),
  mat('worktopMat', 'Worktop board', '@worktop', { section: 'Materials & colors', when: (p) => p.worktop }),
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
    bool('flaps', 'Lift-up flap doors above hood and fridge', true, { section: 'Your space', when: (p) => p.walls }),
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
        if (m.type === 'cooker') wallUnit(p, lib, out, x, m.w, `W hood cabinet ${m.w}`, h, { H: 360, y0: h.wallTop - 360, shelves: 0, flap: p.flaps, doors: p.flaps ? 1 : 'auto' });
        else if (m.type === 'fridge') wallUnit(p, lib, out, x, m.w, `W above fridge ${m.w}`, h, { H: 400, y0: h.wallTop - 400, shelves: 0, flap: p.flaps, doors: p.flaps ? 1 : 'auto' });
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
    segs.forEach(([a, b], i) => {
      const nm = segs.length > 1 ? `Run ${i + 1} · ` : '';
      worktop(p, lib, out, a, b - a, nm);
      plinthBoard(p, lib, out, a, b - a, nm);
      if (p.frame === 'steel') steelBase(out, a, b - a, p.depth, p.plinth, nm.replace(' · ', ''));
    });
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
    if (p.frame === 'steel') steelBase(out, 0, p.width, p.depth, p.plinth);
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
    gradeParam(),
    hingeParam(),
    ...MATERIAL_PARAMS(),
  ],
  presets: { 'Wall 600 × 720': { width: 600, height: 720 }, 'Wall 800 × 720 (2 doors)': { width: 800, height: 720, doors: 'auto' }, 'Above hood 600 × 360 (lift-up)': { width: 600, height: 360, shelves: 0, hingeType: 'flap' }, 'Tall wall 600 × 900': { width: 600, height: 900, shelves: 3 } },
  build(p, lib) {
    const out = newOut();
    wallUnit(p, lib, out, 0, p.width, '', null, { H: p.height, y0: p.mountH, D: p.wallDepth, shelves: p.shelves, doors: p.hingeType === 'flap' ? 1 : p.doors === 'auto' ? 'auto' : Number(p.doors), open: p.doors === '0', flap: p.hingeType === 'flap' });
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
    gradeParam(),
    sel('frame', 'Base', 'legs', [['plinth', 'Plinth board'], ['legs', 'Adjustable legs + plinth'], ['steel', 'Welded steel base frame']], { section: 'Grade & hardware' }),
    hingeParam(),
    ...MATERIAL_PARAMS(),
  ],
  presets: { 'Pantry 600': { width: 600, height: 2100 }, 'Broom cupboard 450': { width: 450, height: 2100, shelves: 2 } },
  build(p, lib) {
    const out = newOut();
    const t = T(lib, p.mat);
    const H = p.height - p.plinth;
    carcass({ x0: 0, y0: p.plinth, z0: 0, W: p.width, H, D: p.depth, T: t, mat: p.mat, color: p.color, doorMat: p.doorMat, doorColor: p.doorColor, doorT: T(lib, p.doorMat), doorEdge: p.doorEdge, backMat: p.backMat, backT: T(lib, p.backMat), top: 'full', sections: [{ shelves: p.shelves, split: Math.min(H - 200, p.split - p.plinth) }], gap: p.gap, grade: p.grade, hingeType: p.hingeType === 'flap' ? 'full' : p.hingeType }, out, lib);
    plinthBoard({ ...p, worktop: false }, lib, out, 0, p.width, '');
    if (p.frame === 'steel') steelBase(out, 0, p.width, p.depth, p.plinth);
    else if (p.frame !== 'plinth') addHw(out, 'legKitchen', 4);
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
    backMat: '@back', backT: T(lib, '@back'), top: 'over', visibleBottom: floating, grade: p.grade, hingeType: 'full',
    sections: [{ drawers: p.nsDrawers, drawerPos: 'top', drawerH: p.nsDrawers > 1 ? (boxH - 2 * t) / p.nsDrawers : 160, drawerFill: p.nsDrawers > 1 && !p.nsShelf, shelves: p.nsShelf && boxH > 320 ? 1 : 0, open: true }],
    prefix: name,
  }, out, lib);
  if (plinth) out.panels.push(panel(`${name} · Plinth`, { mat: p.nsMat || p.mat, color: p.nsColor || p.color, L: W - 2 * t, W: plinth, role: 'plinth', box: { x: x + t, y: 0, z: z0 + D - 30 - t, w: W - 2 * t, h: plinth, d: t } }));
  if (legs) { addHw(out, 'bedLeg', 4); out.legs.push(...[[x + 30, z0 + 30], [x + W - 30, z0 + 30], [x + 30, z0 + D - 30], [x + W - 30, z0 + D - 30]].map(([lx, lz]) => ({ x: lx, z: lz, h: legs, y: 0 }))); }
  if (floating) out.notes.push(`${name}: floating. Hang it on the headboard or wall with a French cleat, bottom at ${Math.round(y0)} mm.`);
}

const BED_GRADE_SETS = {
  economy: { support: 'economy', deckMat: '@deckLight', railLayers: 1, mat: '@carcass' },
  medium: { support: 'medium', deckMat: '@deck', railLayers: 2, mat: '@door' },
  strong: { support: 'strong', deckMat: '@deck', railLayers: 2, mat: '@door', duty: 'hotel' },
};
const UPHOLSTERED = ['padded', 'tufted', 'channel', 'hchannel', 'panels', 'wing'];
const HEAD_STYLES = [
  ['plain', 'Plain board (laminated / painted)'],
  ['padded', 'Upholstery: flat padded panel'],
  ['tufted', 'Upholstery: buttoned / tufted (capitonné)'],
  ['channel', 'Upholstery: vertical channels'],
  ['hchannel', 'Upholstery: horizontal channels'],
  ['panels', 'Upholstery: padded squares'],
  ['wing', 'Upholstery: wingback (side wings)'],
  ['fluted', 'MDF instead of upholstery: fluted / grooved'],
  ['slats', 'MDF instead of upholstery: vertical slats'],
  ['frames', 'MDF instead of upholstery: raised frames'],
  ['layered', 'MDF instead of upholstery: layered panels'],
];
const CUTOUT_SIZES = { socket2: [146, 86, 'Double socket'], socket: [86, 86, 'Single socket'], usb: [86, 86, 'USB socket'], switch: [86, 86, 'Light switch'], lamp: [60, 60, 'Reading lamp wire'] };

MODELS.bed = {
  name: 'Bed', icon: '🛏️', group: 'Bedroom',
  desc: 'Single, twin, joinable twins, double, queen, king: rails, plywood deck on steel (economy / medium / strong), upholstered or MDF headboards, nightstands, socket cut-outs.',
  params: [
    sel('size', 'Mattress size', 'queen', [...BED_SIZES, ['custom', 'Custom size']], { section: 'Size' }),
    num('mW', 'Mattress width', 1600, { min: 600, max: 2400, section: 'Size', when: (p) => p.size === 'custom' }),
    num('mL', 'Mattress length', 2000, { min: 1500, max: 2400, section: 'Size', when: (p) => p.size === 'custom' }),
    num('mT', 'Mattress thickness', 220, { min: 80, max: 400, section: 'Size' }),
    sel('count', 'Beds', '1', [['1', 'One bed'], ['2', 'Two twins that join into one (zip & link)']], { section: 'Size', help: 'Two twin frames side by side with connector brackets: use them apart as twins or joined as a king.' }),
    sel('grade', 'Build grade', 'medium', Object.entries(GRADES).map(([k, g]) => [k, g.name]), { section: 'Grade & steel', sets: (v) => BED_GRADE_SETS[v] || {}, help: 'Sets the steel, deck, rails and boards. Economy = cheap. Medium = fair for long-term use. Strong = welded frame for hotels and heavy use.' }),
    sel('support', 'Steel / supports under the deck', 'medium', [['economy', 'Economy: 25×25 tubes on holder strips'], ['medium', 'Medium: angle 30×30 + 40×20 tubes'], ['strong', 'Strong: welded 40×40 frame + 40×20 tubes'], ['wood', 'Timber battens 45×70'], ['none', 'None: deck rests on the holders only']], { section: 'Grade & steel' }),
    sel('deck', 'Mattress support', 'board', [['board', 'Board deck (plywood / MDF)'], ['slats', 'Wooden slats']], { section: 'Grade & steel' }),
    mat('deckMat', 'Deck board', '@deck', { section: 'Grade & steel', when: (p) => p.deck === 'board' }),
    sel('duty', 'Use', 'hotel', [['home', 'Home'], ['hotel', 'Hotel / heavy use (closer supports)']], { section: 'Grade & steel' }),
    num('clear', 'Space around the mattress', 10, { min: 0, max: 40, section: 'Frame' }),
    num('railH', 'Rail height', 260, { min: 120, max: 450, section: 'Frame' }),
    cnt('railLayers', 'Rail board layers', 2, { min: 1, max: 3, section: 'Frame', help: '2 layers (36 mm) makes strong rails for heavy hotel use.' }),
    num('legH', 'Height under the rails (legs)', 120, { min: 0, max: 400, section: 'Frame', help: '0 = rails sit on the floor (easy to clean, nothing falls under).' }),
    num('recess', 'Mattress sits below the rail top by', 60, { min: 0, max: 200, section: 'Frame' }),
    num('ledgerH', 'Deck holder strip height', 50, { min: 30, max: 100, section: 'Frame', help: 'Strips screwed and glued inside the rails. The steel rests on them, and the deck rests on the steel.' }),
    sel('head', 'Headboard height', 'standard', [['none', 'None'], ['low', 'Low (900 mm)'], ['standard', 'Standard (1100 mm)'], ['tall', 'Tall (1300 mm)'], ['hotel', 'Hotel tall (1500 mm)'], ['custom', 'Custom height']], { section: 'Headboard' }),
    num('headH', 'Headboard height from floor', 1100, { min: 600, max: 2600, section: 'Headboard', when: (p) => p.head === 'custom' }),
    sel('headWidth', 'Headboard width', 'bed', [['bed', 'Same as the bed'], ['over', 'Bed + 50 mm each side'], ['wide', 'Wide: also behind the nightstands'], ['custom', 'Custom width']], { section: 'Headboard', when: (p) => p.head !== 'none' }),
    num('headWc', 'Headboard width', 2400, { min: 600, max: 5000, section: 'Headboard', when: (p) => p.head !== 'none' && p.headWidth === 'custom' }),
    cnt('headLayers', 'Headboard board layers', 1, { min: 1, max: 2, section: 'Headboard', when: (p) => p.head !== 'none' }),
    bool('shared', 'One headboard across both twins', true, { section: 'Headboard', when: (p) => p.count === '2' && p.head !== 'none' }),
    sel('headStyle', 'Headboard style', 'plain', HEAD_STYLES, { section: 'Headboard style', when: (p) => p.head !== 'none', help: 'Upholstery (tapisserie) needs foam and fabric. The MDF styles give a similar look with only MDF and paint: cheaper, easier to clean, nothing to wear out.' }),
    sel('foam', 'Foam thickness', '50', [['25', '25 mm (thin, firm)'], ['50', '50 mm (standard)'], ['75', '75 mm (plush hotel)']], { section: 'Headboard style', when: (p) => p.head !== 'none' && UPHOLSTERED.includes(p.headStyle) }),
    sel('fabric', 'Fabric', 'velvet', [['velvet', 'Velvet'], ['linen', 'Linen / woven'], ['leather', 'Faux leather (PU)'], ['suede', 'Suede'], ['boucle', 'Bouclé']], { section: 'Headboard style', when: (p) => p.head !== 'none' && UPHOLSTERED.includes(p.headStyle) }),
    color('fabricColor', 'Fabric color', 'cream', { section: 'Headboard style', when: (p) => p.head !== 'none' && UPHOLSTERED.includes(p.headStyle) }),
    num('padTop', 'Space above the padding', 80, { min: 0, max: 400, section: 'Headboard style', when: (p) => p.head !== 'none' && p.headStyle !== 'plain' }),
    num('btn', 'Button spacing', 150, { min: 80, max: 300, section: 'Headboard style', when: (p) => p.headStyle === 'tufted' }),
    num('channelW', 'Channel width', 150, { min: 60, max: 400, section: 'Headboard style', when: (p) => p.headStyle === 'channel' || p.headStyle === 'hchannel' }),
    num('panelSize', 'Square size', 300, { min: 150, max: 700, section: 'Headboard style', when: (p) => p.headStyle === 'panels' }),
    num('wingD', 'Wing depth', 250, { min: 100, max: 500, section: 'Headboard style', when: (p) => p.headStyle === 'wing' }),
    num('slatW', 'Slat width', 60, { min: 20, max: 200, section: 'Headboard style', when: (p) => p.headStyle === 'slats' }),
    num('slatGap', 'Gap between slats', 20, { min: 5, max: 100, section: 'Headboard style', when: (p) => p.headStyle === 'slats' }),
    num('flute', 'Groove spacing', 30, { min: 10, max: 100, section: 'Headboard style', when: (p) => p.headStyle === 'fluted' }),
    cnt('frames', 'Number of frames', 2, { min: 1, max: 4, section: 'Headboard style', when: (p) => p.headStyle === 'frames' }),
    color('accentColor', 'Slats / frames / layer color', 'oak', { section: 'Headboard style', when: (p) => ['slats', 'frames', 'layered', 'fluted'].includes(p.headStyle) }),
    { k: 'cutouts', label: 'Sockets and switches on the headboard', type: 'list', section: 'Sockets on the headboard', def: [], when: (p) => p.head !== 'none',
      help: 'Measure from the LEFT end of the headboard and from the floor. The Room tab fills these in for you from the sockets on the wall.',
      fields: [
        { k: 'kind', label: 'Type', type: 'sel', def: 'socket2', opts: Object.entries(CUTOUT_SIZES).map(([k, v]) => [k, v[2]]) },
        { k: 'x', label: 'Centre from the left end', type: 'num', len: true, def: 300, min: 0 },
        { k: 'y', label: 'Centre height from the floor', type: 'num', len: true, def: 650, min: 0 },
      ] },
    sel('foot', 'Footboard', 'none', [['none', 'None'], ['low', 'Low (rail + 50 mm)'], ['high', 'High (rail + 250 mm)']], { section: 'Headboard' }),
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
    mat('mat', 'Frame board', '@door', { section: 'Materials & colors' }),
    color('color', 'Frame color', 'walnut', { section: 'Materials & colors' }),
    color('headColor', 'Headboard color', 'walnut', { section: 'Materials & colors' }),
    color('nsColor', 'Nightstand color', 'walnut', { section: 'Materials & colors' }),
    color('nsFront', 'Drawer front color', 'cream', { section: 'Materials & colors' }),
  ].filter(Boolean),
  presets: {
    'Hotel queen (1600×2000)': { size: 'queen', count: '1', grade: 'strong', ...BED_GRADE_SETS.strong, head: 'hotel', headWidth: 'wide', headStyle: 'channel', ns: 'both', legH: 0 },
    'Hotel twin (1000×2000)': { size: 'twin', count: '1', grade: 'medium', ...BED_GRADE_SETS.medium, head: 'standard', headStyle: 'padded', ns: 'left', legH: 0 },
    'Joinable twins → king (2× 900×2000)': { size: 'single200', count: '2', grade: 'strong', ...BED_GRADE_SETS.strong, head: 'tall', shared: true, headStyle: 'panels', ns: 'both', legH: 0 },
    'Hotel king suite (1800×2000)': { size: 'king', count: '1', grade: 'strong', ...BED_GRADE_SETS.strong, head: 'hotel', headWidth: 'wide', headStyle: 'tufted', foam: '75', ns: 'both', legH: 0 },
    'Cheap single (900×1900)': { size: 'single', count: '1', grade: 'economy', ...BED_GRADE_SETS.economy, duty: 'home', head: 'low', headStyle: 'plain', ns: 'right' },
    'Home double (1400×1900)': { size: 'double', count: '1', grade: 'medium', ...BED_GRADE_SETS.medium, duty: 'home', head: 'standard', headStyle: 'slats', ns: 'both' },
    'Fluted MDF queen (no fabric)': { size: 'queen', count: '1', grade: 'medium', ...BED_GRADE_SETS.medium, head: 'tall', headWidth: 'wide', headStyle: 'fluted', ns: 'both', nsBase: 'floating' },
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
    const support = p.support === 'metal' ? 'medium' : p.support;
    const steel = BED_METAL[support] || null;
    const bh = steel ? steel.crossH : support === 'wood' ? 45 : 0;
    const supportBottom = deckTop - deckT - bh;
    const nsOn = p.ns !== 'none';
    const nsH = p.nsHeight === 'custom' ? p.nsHc : r5(mattressTop);
    const headH = { low: 900, standard: 1100, tall: 1300, hotel: 1500, custom: p.headH }[p.head] || 0;
    const hbT = t * p.headLayers;
    const nsLeft = p.ns === 'left' || p.ns === 'both';
    const nsRight = p.ns === 'right' || p.ns === 'both';
    const deckF = deckT >= 18 ? 1.15 : deckT >= 15 ? 1.05 : deckT >= 12 ? 1 : deckT >= 10 ? 0.85 : 0.7;

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
      const ledTop = support === 'none' ? deckTop - deckT : supportBottom;
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
      const maxSpan = (steel ? steel.spacing : p.duty === 'hotel' ? 400 : 500) * deckF;
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
        out.notes.push(`${pre}Drill Ø30 mm air holes about every 300 mm in the deck so the mattress can breathe. Screw the deck to every steel tube (Ø4 pilot holes in the steel, self-tapping screws).`);
      }

      // ---- supports across the width
      const supports = [];
      const inner0 = x0 + rt + t; // inside face of the holder strips
      const innerW = iW - 2 * t;
      if (support !== 'none') {
        const nb = Math.max(1, Math.ceil(iL / maxSpan) - 1);
        for (let k = 1; k <= nb; k++) supports.push(rt + (iL * k) / (nb + 1));
        for (const j of joints) if (!supports.some((z) => Math.abs(z - j) < 60)) supports.push(j);
        supports.sort((a, b) => a - b);
        const crossLen = steel && steel.perimeter ? innerW - 2 * 40 + 2 * t - 10 : innerW - 5 + (steel && steel.ledger ? 2 * t - 10 : 0);
        const crossX = steel && steel.perimeter ? x0 + rt + 2 + 40 : steel && steel.ledger ? x0 + rt + 5 : inner0 + 2.5;
        if (steel) {
          out.linear.push({ key: steel.cross, name: `${pre}${steel.crossName} across the bed`, len: crossLen, qty: supports.length });
          if (steel.ledger) {
            out.linear.push({ key: steel.ledger, name: `${pre}Steel angle 30×30×3 along the side rails`, len: iL - 10, qty: 2 });
            for (const lx of [x0 + rt + 2, x0 + OW - rt - 32]) out.bars.push({ x: lx, y: supportBottom, z: rt + 5, w: 30, h: 30, d: iL - 10, kind: 'metal' });
            addHw(out, 'bolt8', supports.length * 2);
            addHw(out, 'screw', 2 * Math.ceil(iL / 300));
          } else if (steel.perimeter) {
            out.linear.push({ key: 'shs40', name: `${pre}Welded frame long sides 40×40×2`, len: iL - 4, qty: 2 });
            out.linear.push({ key: 'shs40', name: `${pre}Welded frame ends 40×40×2`, len: innerW + 2 * t - 84, qty: 2 });
            const fx0 = x0 + rt + 2;
            const fw = iW - 4;
            out.bars.push({ x: fx0, y: supportBottom, z: rt + 2, w: 40, h: 40, d: iL - 4, kind: 'metal' });
            out.bars.push({ x: fx0 + fw - 40, y: supportBottom, z: rt + 2, w: 40, h: 40, d: iL - 4, kind: 'metal' });
            out.bars.push({ x: fx0 + 40, y: supportBottom, z: rt + 2, w: fw - 80, h: 40, d: 40, kind: 'metal' });
            out.bars.push({ x: fx0 + 40, y: supportBottom, z: OL - rt - 42, w: fw - 80, h: 40, d: 40, kind: 'metal' });
            addHw(out, 'gusset', 4);
            addHw(out, 'bolt8', 2 * Math.ceil(iL / 500) + 4);
            addHw(out, 'weld', 1);
          } else {
            addHw(out, 'screw', supports.length * 4);
          }
          out.notes.push(`${pre}${steel.name}: ${steel.note}`);
        } else {
          out.linear.push({ key: 'batten', name: `${pre}Timber batten 45×70 across the bed`, len: crossLen, qty: supports.length });
        }
        supports.forEach((z) => out.bars.push({ x: crossX, y: supportBottom, z: z - 20, w: crossLen, h: bh, d: steel ? 20 : 45, kind: steel ? 'metal' : 'wood' }));
        const gaps = supports.map((z, i) => z - (i ? supports[i - 1] : rt));
        gaps.push(OL - rt - supports[supports.length - 1]);
        out.notes.push(`${pre}${supports.length} cross ${steel ? 'tubes' : 'battens'}, ${Math.round(crossLen)} mm long. Centres at ${supports.map((z) => Math.round(z)).join(', ')} mm from the head end. Largest gap ${Math.round(Math.max(...gaps))} mm.`);
      }
      // center beam for wide beds
      if (iW > 1300) {
        const len = iL - 10;
        const key = support === 'wood' ? 'batten' : steel ? steel.beam : 'metalBox';
        out.linear.push({ key, name: `${pre}Center beam (lengthwise)`, len, qty: 1 });
        const beamH = steel && steel.beam === 'shs40' ? 40 : 40;
        out.bars.push({ x: x0 + OW / 2 - 20, y: supportBottom - (support === 'none' ? 0 : beamH), z: rt + 5, w: 40, h: beamH, d: len, kind: support === 'wood' ? 'wood' : 'metal' });
        const cl = steel ? steel.beamLegs : iL > 1600 ? 2 : 1;
        addHw(out, 'bedLeg', cl);
        for (let k = 1; k <= cl; k++) out.legs.push({ x: x0 + OW / 2, z: rt + (iL * k) / (cl + 1), h: Math.max(0, supportBottom - beamH), y: 0, metal: true });
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
    out.headboards = [];
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
        if (p.headWidth === 'custom' && boards.length === 1) { left = bx + bw / 2 - p.headWc / 2; right = bx + bw / 2 + p.headWc / 2; }
        const hbW = right - left;
        out.headboards.push({ left, right, h: headH, front: 0 });
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
        // decorated area: over the bed (+50 mm each side), from just below the mattress top
        const style = p.headStyle || (p.padded ? 'padded' : 'plain');
        if (style !== 'plain') {
          const aw = Math.min(hbW - 40, bw + 100);
          const ax = Math.max(left + 20, bx + bw / 2 - aw / 2);
          const ay = Math.max(railTop + 20, mattressTop - 100);
          const ah = headH - p.padTop - ay;
          if (ah > 150) headDecor(p, lib, out, style, { x: ax, y: ay, w: aw, h: ah, z: 0, bedLeft: bx, bedW: bw, headH, left, right });
          else out.warnings.push('The headboard is too low for a padded / decorated panel above the mattress.');
        }
      });
      if (headH < mattressTop + 300) out.warnings.push(`The headboard (${headH} mm) is only ${Math.round(headH - mattressTop)} mm above the mattress top: pillows need about 300 mm or more.`);
      cutouts(p, out, headH, mattressTop);
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
      const sockH = r5(nsH + 150);
      out.notes.push(`Sockets for this bed: one double socket beside each nightstand, centred about ${sockH} mm from the floor (150 mm above the nightstand top) so plugs and chargers clear the top. Reading-light switches at 750–900 mm, within reach of the pillow.`);
    }

    out.size = { w: totalW + (nsLeft && nsOn ? p.nsW + p.nsGap : 0) + (nsRight && nsOn ? p.nsW + p.nsGap : 0), h: Math.max(headH, nsH, railTop), d: OL + hbT };
    out.offsetX = nsLeft && nsOn ? -(p.nsW + p.nsGap) : 0;
    out.bed = { totalW, OL, mattressTop, nsH: nsOn ? nsH : 0, nsLeft: nsOn && nsLeft, nsRight: nsOn && nsRight, nsW: p.nsW, nsGap: p.nsGap, headH };
    out.notes.unshift(`${count === 2 ? 'Each twin frame' : 'Frame'}: ${Math.round(OW)} × ${Math.round(OL)} mm outside, for a ${m.w} × ${m.l} mm mattress${count === 2 ? ` (joined: ${Math.round(OW * 2)} mm wide)` : ''}. Rail top ${railTop} mm, deck top ${Math.round(deckTop)} mm, mattress top ${Math.round(mattressTop)} mm from the floor.`);
    if (support !== 'none' || p.deck === 'board') {
      out.notes.unshift(`Inside the rails, from the rail top down: ${p.recess} mm mattress recess → ${deckT} mm deck${bh ? ` → ${bh} mm ${steel ? 'steel' : 'batten'}` : ''} → ${p.ledgerH} mm holder strip (its top at ${Math.round(support === 'none' ? deckTop - deckT : supportBottom)} mm from the floor).`);
    }
    if (supportBottom - p.ledgerH < p.legH + 5) out.warnings.push('The holder strips hang below the rails: make the rails taller, or reduce the recess.');
    if (iW > 1300 && p.legH === 0) out.notes.push('Rails sit on the floor: put the center legs on felt pads so they don’t mark the floor.');
    return out;
  },
};

// Upholstery (tapisserie) and MDF look-alikes on the headboard
function headDecor(p, lib, out, style, a) {
  const padMat = '@pad';
  const padT = T(lib, padMat);
  const foam = Number(p.foam) || 50;
  const fabricName = { velvet: 'velvet', linen: 'linen', leather: 'faux leather', suede: 'suede', boucle: 'bouclé' }[p.fabric] || 'fabric';
  const pieces = []; // padded pieces: {name, x, y, w, h}
  const add = (name, o) => out.panels.push(panel(name, { group: 'Headboard', role: 'head', ...o }));
  if (UPHOLSTERED.includes(style)) {
    if (style === 'channel' || style === 'hchannel') {
      const along = style === 'channel' ? a.w : a.h;
      const n = Math.max(2, Math.round(along / p.channelW));
      const each = along / n;
      for (let k = 0; k < n; k++) pieces.push(style === 'channel'
        ? { name: `Channel ${k + 1}/${n}`, x: a.x + k * each, y: a.y, w: each - 3, h: a.h }
        : { name: `Channel ${k + 1}/${n}`, x: a.x, y: a.y + k * each, w: a.w, h: each - 3 });
    } else if (style === 'panels') {
      const cols = Math.max(1, Math.round(a.w / p.panelSize));
      const rows = Math.max(1, Math.round(a.h / p.panelSize));
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) pieces.push({ name: `Square r${r + 1}c${c + 1}`, x: a.x + (c * a.w) / cols, y: a.y + (r * a.h) / rows, w: a.w / cols - 4, h: a.h / rows - 4 });
    } else {
      pieces.push({ name: 'Padded panel', x: a.x, y: a.y, w: a.w, h: a.h });
    }
    // base boards (cut from MDF), split if bigger than a sheet
    for (const pc of pieces) {
      const sp = splitToFit(pc.w, pc.h, sheetOf(lib, padMat), lib.settings.trim);
      const k = sp.along === 'L' ? sp.pieces : 1;
      for (let i = 0; i < k; i++) add(`Upholstery base · ${pc.name}${k > 1 ? ` (${i + 1}/${k})` : ''}`, { mat: padMat, color: 'raw', L: pc.w / k, W: pc.h, grain: false, box: { x: pc.x + (i * pc.w) / k, y: pc.y, z: a.z, w: pc.w / k, h: pc.h, d: padT + foam }, explode: [0, 0, 1] });
      // color the padded face: a thin "fabric" skin for the 3D view
      out.marks.push({ x: pc.x + 3, y: pc.y + 3, z: a.z + padT + foam, w: pc.w - 6, h: pc.h - 6, d: 4, color: p.fabricColor, soft: true, info: `${pc.name}: ${fabricName}, ${foam} mm foam` });
    }
    if (style === 'wing') {
      const wh = a.headH;
      for (const [nm, x] of [['left', a.left], ['right', a.right - 18]]) {
        add(`Wing (${nm})`, { mat: '@carcass', color: 'raw', L: wh, W: p.wingD, grain: false, box: { x, y: 0, z: a.z, w: 18, h: wh, d: p.wingD }, explode: [nm === 'left' ? -1 : 1, 0, 1] });
        out.marks.push({ x: x - 3, y: 3, z: a.z, w: 24, h: wh - 6, d: p.wingD + 20, color: p.fabricColor, soft: true, info: `Wing (${nm}), padded both sides` });
        pieces.push({ name: `Wing ${nm} (both faces)`, w: p.wingD * 2 + 18, h: wh });
      }
      out.notes.push('Wings: screw the 18 mm wing boards to the headboard ends from behind (4 screws 4×50 + glue), then pad and cover both faces.');
    }
    // quantities: fabric with wrap-around, foam, dacron, buttons
    const wrap = foam + 60;
    const tuft = style === 'tufted' ? 1.35 : style === 'channel' || style === 'hchannel' ? 1.12 : 1;
    let fabricArea = 0;
    let foamArea = 0;
    for (const pc of pieces) {
      fabricArea += (pc.w + 2 * wrap) * (pc.h + 2 * wrap) * tuft;
      foamArea += pc.w * pc.h;
    }
    const fabricM = Math.ceil(((fabricArea / 1e6) / 1.4) * 1.1 * 10) / 10;
    const foamSheets = Math.ceil(((foamArea / 1e6) * 1.1) / 2);
    addHw(out, 'fabric', fabricM);
    addHw(out, `foam${foam}`, foamSheets);
    addHw(out, 'dacron', Math.ceil(((fabricArea / 1e6) / 1.5) * 10) / 10);
    addHw(out, 'staples', 1);
    addHw(out, 'sprayGlue', Math.max(1, Math.ceil(foamArea / 1e6 / 4)));
    if (style === 'tufted') {
      const rows = Math.max(2, Math.floor(a.h / p.btn));
      const cols = Math.max(2, Math.floor(a.w / p.btn));
      let n = 0;
      for (let r = 0; r < rows; r++) {
        const off = r % 2 ? p.btn / 2 : 0;
        for (let c = 0; c < cols; c++) {
          const bx = a.x + (a.w - (cols - 1) * p.btn) / 2 + c * p.btn + off - p.btn / 4;
          const by = a.y + (a.h - (rows - 1) * p.btn) / 2 + r * p.btn;
          if (bx < a.x + 40 || bx > a.x + a.w - 40) continue;
          n++;
          out.marks.push({ x: bx - 9, y: by - 9, z: a.z + padT + foam + 4, w: 18, h: 18, d: 6, color: '#3a3330', info: 'Button' });
        }
      }
      addHw(out, 'buttons', n);
      out.notes.push(`Tufted headboard: ${n} buttons in a diamond pattern, ${p.btn} mm apart. Drill Ø8 mm holes through the MDF base and cut matching holes in the foam; pull each button through with strong twine and staple it at the back.`);
    }
    out.notes.push(`Upholstery (${style === 'tufted' ? 'tufted' : style.includes('channel') ? 'channels' : style === 'panels' ? 'squares' : style === 'wing' ? 'wingback' : 'flat padded'}): ${pieces.length} piece${pieces.length > 1 ? 's' : ''}. Glue ${foam} mm foam to the MDF base, add one layer of dacron, then stretch the ${fabricName} and staple it at the back (start in the middle of each side, work to the corners). About ${fabricM} m of 1.4 m wide fabric and ${foamSheets} foam sheet${foamSheets > 1 ? 's' : ''}. Screw the padded pieces to the headboard from behind, or hang them on French cleats.`);
    if (pieces.length > 1 && style !== 'wing') addHw(out, 'cleat', pieces.length);
    return;
  }
  // MDF instead of upholstery
  const strip = '@strip';
  const st = T(lib, strip);
  if (style === 'slats') {
    const n = Math.max(3, Math.floor((a.w + p.slatGap) / (p.slatW + p.slatGap)));
    const used = n * p.slatW + (n - 1) * p.slatGap;
    for (let k = 0; k < n; k++) add(`Slat ${k + 1}/${n}`, { mat: strip, color: p.accentColor, L: a.h, W: p.slatW, eL: 2, eW: 1, box: { x: a.x + (a.w - used) / 2 + k * (p.slatW + p.slatGap), y: a.y, z: a.z, w: p.slatW, h: a.h, d: st }, explode: [0, 0, 1] });
    out.notes.push(`Slatted headboard: ${n} MDF slats ${p.slatW} mm wide, ${p.slatGap} mm gaps. Paint the board behind a dark color first, then glue and pin the slats using a ${p.slatGap} mm spacer block.`);
  } else if (style === 'fluted') {
    add('Fluted panel', { mat: strip, color: p.accentColor, L: a.w, W: a.h, eL: 2, eW: 2, edge: 'thick', box: { x: a.x, y: a.y, z: a.z, w: a.w, h: a.h, d: st }, explode: [0, 0, 1] });
    const n = Math.floor(a.w / p.flute);
    for (let k = 1; k < n; k++) out.marks.push({ x: a.x + k * p.flute - 3, y: a.y + 20, z: a.z + st - 2, w: 6, h: a.h - 40, d: 3, color: '#3b302a', info: 'Groove' });
    out.notes.push(`Fluted panel: rout ${n - 1} vertical grooves (6 mm round or V bit, 4 mm deep) every ${p.flute} mm, stopping 20 mm from the top and bottom. Use a straight batten as a guide. Prime with MDF sealer before painting (grooves soak up paint).`);
  } else if (style === 'frames') {
    const n = p.frames;
    const gap = 40;
    const fw = (a.w - gap * (n - 1)) / n;
    const sw = 50;
    for (let k = 0; k < n; k++) {
      const fx = a.x + k * (fw + gap);
      add(`Frame ${k + 1} top/bottom`, { mat: strip, color: p.accentColor, L: fw, W: sw, eL: 2, box: { x: fx, y: a.y + a.h - sw, z: a.z, w: fw, h: sw, d: st } });
      add(`Frame ${k + 1} top/bottom`, { mat: strip, color: p.accentColor, L: fw, W: sw, eL: 2, box: { x: fx, y: a.y, z: a.z, w: fw, h: sw, d: st } });
      add(`Frame ${k + 1} side`, { mat: strip, color: p.accentColor, L: a.h, W: sw, eL: 2, box: { x: fx, y: a.y, z: a.z, w: sw, h: a.h, d: st } });
      add(`Frame ${k + 1} side`, { mat: strip, color: p.accentColor, L: a.h, W: sw, eL: 2, box: { x: fx + fw - sw, y: a.y, z: a.z, w: sw, h: a.h, d: st } });
    }
    out.notes.push(`Raised frames: ${n} frames of ${sw} mm MDF strips, corners cut at 45°, glued and pinned to the headboard. Round the outer edges with a router before painting.`);
  } else if (style === 'layered') {
    add('Layer 1 (large)', { mat: strip, color: p.accentColor, L: a.w, W: a.h, eL: 2, eW: 2, edge: 'thick', box: { x: a.x, y: a.y, z: a.z, w: a.w, h: a.h, d: st }, explode: [0, 0, 1] });
    const i2 = 80;
    add('Layer 2 (inner)', { mat: strip, color: p.headColor, L: a.w - 2 * i2, W: a.h - 2 * i2, eL: 2, eW: 2, edge: 'thick', box: { x: a.x + i2, y: a.y + i2, z: a.z + st, w: a.w - 2 * i2, h: a.h - 2 * i2, d: st }, explode: [0, 0, 2] });
    out.notes.push('Layered panels: glue and screw each layer from behind; the step between layers casts a shadow line. Two colors look best (the app uses the headboard and accent colors).');
  }
}

// Socket / switch holes in the headboard
function cutouts(p, out, headH, mattressTop) {
  const list = Array.isArray(p.cutouts) ? p.cutouts : [];
  if (!list.length || !out.headboards.length) return;
  const hb = out.headboards[0];
  const left = Math.min(...out.headboards.map((h) => h.left));
  const thick = (out.panels.find((x) => x.role === 'head') || { box: { d: 18 } }).box.d;
  const lines = [];
  for (const c of list) {
    const [w, h, label] = CUTOUT_SIZES[c.kind] || CUTOUT_SIZES.socket2;
    const x = left + Number(c.x);
    const y = Number(c.y);
    const onBoard = out.headboards.some((b) => x - w / 2 >= b.left && x + w / 2 <= b.right) && y + h / 2 <= headH - 20;
    if (!onBoard) { lines.push(`${label} at ${Math.round(c.x)} mm / ${Math.round(y)} mm high is outside the headboard: nothing to cut.`); continue; }
    out.marks.push({ x: x - w / 2, y: y - h / 2, z: hb.front + 1, w, h, d: 3, color: '#f8fafc', info: `${label} cut-out ${w}×${h}` });
    addHw(out, 'socketBox', 1);
    lines.push(`${label}: cut ${w}×${h} mm, centre ${Math.round(c.x)} mm from the left end, ${Math.round(y)} mm from the floor${y < mattressTop + 60 ? ' (low: the mattress may block it)' : ''}`);
  }
  if (lines.length) out.notes.push(`Headboard cut-outs (headboard ${Math.round(thick)} mm thick: use a socket extension box/frame so the socket sits flush with the front; switch the power off when fitting):\n• ${lines.join('\n• ')}`);
}

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
    sel('base', 'Base', 'plinth', [['plinth', 'Plinth'], ['legs', 'Legs'], ['steel', 'Welded steel base frame'], ['none', 'Straight on the floor']], { section: 'Size' }),
    num('plinthH', 'Plinth / leg height', 80, { min: 0, max: 250, section: 'Size', when: (p) => p.base !== 'none' }),
    sel('style', 'Front', 'closed', [['closed', 'Closed (doors)'], ['open', 'Open (no doors)'], ['lower', 'Doors below, open above']], { section: 'Layout' }),
    num('splitH', 'Height of the lower doors', 900, { min: 300, max: 2000, section: 'Layout', when: (p) => p.style === 'lower' }),
    sel('sectionsMode', 'Sections', 'auto', [['auto', 'Automatic'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']], { section: 'Layout', help: 'Automatic adds a divider about every 900 mm so shelves don’t sag.' }),
    { k: 'sections', label: 'What goes in each section', type: 'list', fields: SECTION_FIELDS, section: 'Layout', def: [{ shelves: 4 }], help: 'Each row is a section, left to right.' },
    sel('top', 'Top', 'over', [['over', 'Top sits on the sides'], ['full', 'Top between the sides']], { section: 'Construction' }),
    num('gap', 'Gap around doors', 3, { min: 1, max: 6, section: 'Construction' }),
    num('maxDoor', 'Widest allowed door', 600, { min: 300, max: 900, section: 'Construction' }),
    gradeParam({ economy: { ...GRADE_SETS.economy, base: 'plinth' }, medium: { ...GRADE_SETS.medium, base: 'plinth' }, strong: { ...GRADE_SETS.strong, base: 'steel' } }),
    hingeParam(),
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
    carcass({ x0: 0, y0: base, z0: 0, W: p.width, H, D: p.depth, T: t, mat: p.mat, color: p.color, doorMat: p.doorMat, doorColor: p.doorColor, doorT: T(lib, p.doorMat), doorEdge: p.doorEdge, backMat: p.backMat, backT: T(lib, p.backMat), top: p.top, sections, gap: p.gap, maxDoor: p.maxDoor, grade: p.grade, hingeType: p.hingeType === 'flap' && p.height > 900 ? 'full' : p.hingeType }, out, lib);
    if (p.base === 'steel' && base) steelBase(out, 0, p.width, p.depth, base);
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
    gradeParam({ economy: { mat: '@carcass' }, medium: { mat: '@door' }, strong: { mat: '@door' } }),
    mat('mat', 'Board', '@door', { section: 'Materials & colors' }),
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


/* ================================================================ WARDROBE + DESK + COAT RACK (fitted to a wall) */

MODELS.combo = {
  name: 'Wardrobe + desk + coat rack', icon: '🧥', group: 'Storage',
  desc: 'Give the free wall length: it fits a wardrobe, a desk (fixed or fold-down) and an open coat section with hooks and a bench.',
  params: [
    num('space', 'Free wall length', 2600, { min: 900, max: 6000, section: 'Your space', help: 'Measure the wall between corners, doors and windows. The Room tab can fill this in.' }),
    num('ceil', 'Ceiling height', 2700, { min: 2000, max: 4000, section: 'Your space' }),
    num('height', 'Height', 2200, { min: 1600, max: 2700, section: 'Your space' }),
    num('depth', 'Wardrobe depth', 600, { min: 450, max: 700, section: 'Your space' }),
    sel('order', 'Order (left → right)', 'wdc', [['wdc', 'Wardrobe · Desk · Coat'], ['cwd', 'Coat · Wardrobe · Desk'], ['dwc', 'Desk · Wardrobe · Coat'], ['wd', 'Wardrobe · Desk'], ['dw', 'Desk · Wardrobe'], ['wc', 'Wardrobe · Coat'], ['cw', 'Coat · Wardrobe'], ['dc', 'Desk · Coat']], { section: 'Your space' }),
    num('wardW', 'Wardrobe width (0 = automatic)', 0, { min: 0, max: 3000, section: 'Wardrobe' }),
    bool('wardShelves', 'Shelf column beside the hanging space', true, { section: 'Wardrobe', help: 'Used when the wardrobe is 1000 mm or wider.' }),
    cnt('wardDrawers', 'Drawers under the shelves', 2, { max: 4, section: 'Wardrobe' }),
    bool('mirror', 'Mirror on one door', true, { section: 'Wardrobe' }),
    sel('deskType', 'Desk', 'fixed', [['fixed', 'Fixed desk top'], ['fold', 'Fold-down desk (saves space)']], { section: 'Desk' }),
    num('deskW', 'Desk width (0 = automatic)', 0, { min: 0, max: 3000, section: 'Desk' }),
    num('deskH', 'Desk height', 750, { min: 650, max: 800, section: 'Desk', help: 'Standard 730–760 mm. Chair seat about 450 mm.' }),
    num('deskD', 'Desk depth', 550, { min: 350, max: 700, section: 'Desk', when: (p) => p.deskType === 'fixed' }),
    bool('pedestal', 'Drawer unit under the desk', true, { section: 'Desk', when: (p) => p.deskType === 'fixed' }),
    sel('hutch', 'Above the desk', 'shelves', [['none', 'Nothing'], ['shelves', 'Open shelves'], ['doors', 'Cabinet with doors']], { section: 'Desk' }),
    num('coatW', 'Coat section width', 500, { min: 300, max: 1200, section: 'Coat rack' }),
    cnt('hookRows', 'Rows of hooks', 1, { min: 1, max: 2, section: 'Coat rack', help: 'Second row at 1100 mm for children or bags.' }),
    bool('bench', 'Seat bench with shoe shelf', true, { section: 'Coat rack' }),
    bool('coatShelf', 'Hat shelf on top', true, { section: 'Coat rack' }),
    gradeParam(),
    sel('frame', 'Base', 'plinth', [['plinth', 'Plinth'], ['legs', 'Adjustable legs'], ['steel', 'Welded steel base frame']], { section: 'Grade & hardware' }),
    hingeParam(),
    ...MATERIAL_PARAMS({ color: 'sonoma', doorColor: 'sonoma' }),
  ],
  presets: {
    'Hotel room wall 2.6 m': { space: 2600, order: 'wdc', deskType: 'fixed', hutch: 'shelves' },
    'Small room 1.8 m (fold-down desk)': { space: 1800, order: 'wd', deskType: 'fold', hutch: 'none' },
    'Entrance: coat + wardrobe 1.5 m': { space: 1500, order: 'cw', bench: true },
  },
  // widths of each part from the free wall length
  plan(p) {
    const parts = p.order.split('').map((c) => ({ w: 'wardrobe', d: 'desk', c: 'coat' }[c]));
    const has = (k) => parts.includes(k);
    const avail = p.space;
    const coat = has('coat') ? p.coatW : 0;
    let desk = has('desk') ? (p.deskW || 0) : 0;
    let ward = has('wardrobe') ? (p.wardW || 0) : 0;
    const rest = avail - coat;
    if (has('wardrobe') && has('desk')) {
      if (!ward && !desk) { ward = Math.min(2000, Math.max(900, Math.round((rest * 0.55) / 50) * 50)); desk = rest - ward; if (desk < 800) { ward = Math.max(800, rest - 800); desk = rest - ward; } if (desk > 1400) { ward = Math.min(2400, ward + desk - 1400); desk = rest - ward; } }
      else if (!ward) ward = rest - desk;
      else if (!desk) desk = rest - ward;
    } else if (has('wardrobe')) { if (!ward) ward = rest; }
    else if (has('desk')) { if (!desk) desk = rest; }
    const w = { wardrobe: ward, desk, coat };
    return parts.map((k) => ({ k, w: Math.max(0, w[k]) }));
  },
  build(p, lib) {
    const out = newOut();
    const t = T(lib, p.mat);
    const base = p.frame === 'none' ? 0 : 80;
    const H = p.height - base;
    const parts = this.plan(p);
    const common = { T: t, mat: p.mat, color: p.color, doorMat: p.doorMat, doorColor: p.doorColor, doorT: T(lib, p.doorMat), doorEdge: p.doorEdge, backMat: p.backMat, backT: T(lib, p.backMat), gap: 3, grade: p.grade, hingeType: p.hingeType === 'flap' ? 'full' : p.hingeType };
    let x = 0;
    const layout = [];
    parts.forEach((pt, i) => {
      const w = pt.w;
      if (w < 250) { if (w > 0) out.warnings.push(`Not enough room for the ${pt.k} (${Math.round(w)} mm).`); return; }
      const leftN = parts[i - 1];
      const rightN = parts[i + 1];
      if (pt.k === 'wardrobe') {
        const wide = w >= 1000 && p.wardShelves;
        const sections = wide
          ? [{ rail: true, share: 1.6, hinge: 'L' }, { shelves: 3, drawers: p.wardDrawers, drawerPos: 'bottom', drawerH: 180, share: 1, hinge: 'R' }]
          : [{ rail: true }];
        carcass({ ...common, x0: x, y0: base, z0: 0, W: w, H, D: p.depth, top: 'over', sections, prefix: 'Wardrobe' }, out, lib);
        if (w < 800) out.warnings.push(`Wardrobe is only ${Math.round(w)} mm wide: 800 mm or more is comfortable.`);
        if (p.mirror) out.notes.push('Mirror: glue a 4 mm mirror (door size minus 60 mm) on one wardrobe door with mirror adhesive + 2 safety clips at the bottom. Use 3 hinges even on short doors.');
        layout.push(`Wardrobe ${Math.round(w)}`);
        if (base) this.base(p, out, x, w, base, t);
      } else if (pt.k === 'coat') {
        carcass({ ...common, x0: x, y0: base, z0: 0, W: w, H, D: Math.min(p.depth, 400), top: 'over', sections: [{ shelves: 0, open: true }], prefix: 'Coat section', backColor: p.color }, out, lib);
        const hooksPer = Math.max(2, Math.floor((w - 2 * t) / 150));
        const rows = [1650, 1100].slice(0, p.hookRows);
        rows.forEach((y) => {
          out.panels.push(panel(`Coat section · Hook board (${y} mm)`, { mat: p.mat, color: p.color, L: w - 2 * t, W: 100, eL: 2, role: 'shelf', box: { x: x + t, y: y - 50, z: 0, w: w - 2 * t, h: 100, d: t }, explode: [0, 0, 1] }));
          for (let k = 0; k < hooksPer; k++) out.marks.push({ x: x + t + ((k + 0.5) * (w - 2 * t)) / hooksPer - 8, y: y - 10, z: t, w: 16, h: 40, d: 40, color: '#8d9399', info: 'Coat hook' });
        });
        addHw(out, 'hooks', hooksPer * rows.length);
        const cd = Math.min(p.depth, 400);
        if (p.coatShelf) out.panels.push(panel('Coat section · Hat shelf', { mat: p.mat, color: p.color, L: w - 2 * t, W: cd - 20, eL: 1, role: 'shelf', box: { x: x + t, y: base + H - t - 300, z: 0, w: w - 2 * t, h: t, d: cd - 20 } }));
        if (p.bench) {
          out.panels.push(panel('Coat section · Bench seat', { mat: p.mat, color: p.color, L: w - 2 * t, W: cd, eL: 1, edge: 'thick', role: 'shelf', box: { x: x + t, y: 450 - t, z: 0, w: w - 2 * t, h: t, d: cd } }));
          out.panels.push(panel('Coat section · Shoe shelf', { mat: p.mat, color: p.color, L: w - 2 * t, W: cd - 20, eL: 1, role: 'shelf', box: { x: x + t, y: base + 150, z: 0, w: w - 2 * t, h: t, d: cd - 20 } }));
          out.notes.push('Coat bench: seat at 450 mm. Support the seat with a 50 mm batten screwed to the back panel, as well as the sides (people sit on it).');
        }
        out.notes.push(`Coat section: ${hooksPer * rows.length} hooks on ${rows.length} board${rows.length > 1 ? 's' : ''} at ${rows.join(' and ')} mm. Screw the hook boards through the back panel into the wall (wall plugs), not only into the back.`);
        layout.push(`Coat rack ${Math.round(w)}`);
        if (base) this.base(p, out, x, w, base, t, cd);
      } else if (pt.k === 'desk') {
        const sideL = leftN && leftN.w >= 250; // a neighbour side carries the desk
        const sideR = rightN && rightN.w >= 250;
        if (p.deskType === 'fold') {
          // a shallow wall box; its door folds down to become the desk top
          const bh = 650;
          const bd = 300;
          const y0b = p.deskH - t;
          carcass({ ...common, x0: x, y0: y0b, z0: 0, W: w, H: bh, D: bd, top: 'over', sections: [{ shelves: w > 750 ? 0 : 1, doors: 1, dropDown: true }], prefix: 'Fold-down desk', visibleBottom: true }, out, lib);
          addHw(out, 'wallHanger', 1);
          out.notes.push(`Fold-down desk: the ${Math.round(w)} mm door is hinged at the bottom edge and opens to a ${bh} mm deep desk at ${p.deskH} mm, held by 2 lid stays (rated for 15 kg+ each). Hang the box on a French cleat into the wall (6 plugs).`);
          if (w > 1200) out.warnings.push('Fold-down desk wider than 1200 mm: the door gets heavy and can bend. Use two narrower ones.');
        } else {
          const D = p.deskD;
          const leftX = x + (sideL ? 0 : t);
          const topW = w - (sideL ? 0 : t) - (sideR ? 0 : t);
          out.panels.push(panel('Desk · Top', { mat: p.mat, color: p.color, L: topW, W: D, eL: 1, eW: (sideL ? 0 : 1) + (sideR ? 0 : 1), edge: 'thick', role: 'shelf', box: { x: leftX, y: p.deskH - t, z: 0, w: topW, h: t, d: D }, explode: [0, 1, 0] }));
          if (!sideL) out.panels.push(panel('Desk · End panel (left)', { mat: p.mat, color: p.color, L: p.deskH - t, W: D, eL: 1, eW: 0, edge: 'thick', box: { x, y: 0, z: 0, w: t, h: p.deskH - t, d: D }, explode: [-1, 0, 0] }));
          if (!sideR) out.panels.push(panel('Desk · End panel (right)', { mat: p.mat, color: p.color, L: p.deskH - t, W: D, eL: 1, eW: 0, edge: 'thick', box: { x: x + w - t, y: 0, z: 0, w: t, h: p.deskH - t, d: D }, explode: [1, 0, 0] }));
          out.panels.push(panel('Desk · Back rail', { mat: p.mat, color: p.color, L: topW, W: 150, box: { x: leftX, y: p.deskH - t - 150, z: 20, w: topW, h: 150, d: t } }));
          if (sideL || sideR) out.notes.push('Desk top: carried by the neighbouring cabinet side on a 30×30 batten (or steel angle) screwed along it, plus the back rail screwed to the wall.');
          if (p.pedestal && topW >= 1000) {
            const pw = 400;
            const px = sideR ? leftX + topW - pw : leftX;
            carcass({ ...common, x0: px, y0: 0, z0: 0, W: pw, H: p.deskH - t - 5, D: D - 20, top: 'full', sections: [{ drawers: 3, drawerFill: true }], prefix: 'Desk drawers' }, out, lib);
          } else if (p.pedestal) out.notes.push('Desk is narrower than 1000 mm: no drawer unit, so there is at least 600 mm of knee room.');
          if (topW - (p.pedestal && topW >= 1000 ? 400 : 0) < 600) out.warnings.push('Knee space under the desk is under 600 mm wide.');
          out.notes.push(`Desk: ${Math.round(topW)} × ${D} mm at ${p.deskH} mm. Drill a Ø60 mm cable hole at the back corner and fit a grommet. Put a socket at 850–1000 mm above the desk (not hidden behind the drawers).`);
        }
        if (p.hutch !== 'none') {
          const hy = p.deskType === 'fold' ? p.deskH + 650 + 60 : p.deskH + 550;
          const hH = base + H - hy;
          if (hH > 250) carcass({ ...common, x0: x + (sideL ? 0 : 0), y0: hy, z0: 0, W: w, H: hH, D: 300, top: 'over', visibleBottom: true, sections: Array.from({ length: Math.max(1, Math.ceil((w - 2 * t) / 750)) }, () => ({ shelves: hH > 600 ? 2 : 1, open: p.hutch === 'shelves', doors: 'auto' })), prefix: 'Above the desk' }, out, lib);
          addHw(out, 'wallHanger', 1);
        }
        layout.push(`${p.deskType === 'fold' ? 'Fold-down desk' : 'Desk'} ${Math.round(w)}`);
      }
      x += w;
    });
    out.size = { w: x, h: p.height, d: Math.max(p.depth, p.deskType === 'fixed' ? p.deskD : 300) };
    out.layout = layout;
    out.notes.unshift(`Layout (left → right): ${layout.join(' · ')} = ${Math.round(x)} mm of your ${p.space} mm wall.`);
    if (p.height > p.ceil - 50) out.warnings.push('Too tall for the ceiling: leave 50 mm or more so it can be stood up.');
    else if (p.ceil - p.height > 300 && p.ceil - p.height < 700) out.notes.push(`${Math.round(p.ceil - p.height)} mm free up to the ceiling: add a top box with doors for suitcases, or a filler strip to close it off.`);
    addHw(out, 'wallAnchor', 2);
    return out;
  },
  base(p, out, x, w, h, t, d) {
    if (p.frame === 'steel') steelBase(out, x, w, d || p.depth, h);
    else if (p.frame === 'legs') addHw(out, 'legKitchen', w > 1000 ? 6 : 4);
    else out.panels.push(panel('Plinth', { mat: p.mat, color: p.color, L: w - 2 * t, W: h, eL: 1, role: 'plinth', box: { x: x + t, y: 0, z: (d || p.depth) - 40 - t, w: w - 2 * t, h, d: t } }));
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
      { k: 'mat', label: 'Board', type: 'mat', def: '@carcass' },
      { k: 'color', label: 'Color', type: 'color', def: 'white' },
      { k: 'eL', label: 'Edge band on long sides', type: 'sel', def: '0', opts: [['0', 'None'], ['1', '1 side'], ['2', '2 sides']] },
      { k: 'eW', label: 'Edge band on short sides', type: 'sel', def: '0', opts: [['0', 'None'], ['1', '1 side'], ['2', '2 sides']] },
      { k: 'edge', label: 'Edge band', type: 'sel', def: 'thin', opts: [['thin', '0.4 mm'], ['thick', '2 mm'], ['wide', '1 × 42 mm']] },
      { k: 'grain', label: 'Keep grain along the length', type: 'bool', def: false },
    ], def: [{ name: 'Panel', L: 600, W: 400, qty: 2, mat: '@carcass', color: 'white', eL: '1', eW: '0', edge: 'thin', grain: false }] },
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
  // boards chosen by job ("@carcass") become the real board of the current set
  for (const pn of out.panels) pn.mat = roleMat(lib, pn.mat);
  return out;
}
