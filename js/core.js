// Shared data: materials, colors, edge banding, hardware, settings, and the panel helper
// every furniture model uses. All sizes are in millimetres.
import { storage, uid } from './util.js';

/* ================================================================ colors / finishes */
export const FINISHES = [
  { id: 'white', name: 'White', hex: '#f4f2ee' },
  { id: 'cream', name: 'Cream', hex: '#efe4cc' },
  { id: 'grey', name: 'Light grey', hex: '#c9cacb' },
  { id: 'anthracite', name: 'Anthracite', hex: '#3c3f44' },
  { id: 'black', name: 'Black', hex: '#1d1d1f' },
  { id: 'oak', name: 'Light oak', hex: '#c9a26b', wood: true },
  { id: 'sonoma', name: 'Sonoma oak', hex: '#d4b48a', wood: true },
  { id: 'teak', name: 'Teak', hex: '#a86b3c', wood: true },
  { id: 'walnut', name: 'Walnut', hex: '#6b4a32', wood: true },
  { id: 'wenge', name: 'Wenge', hex: '#3d2b22', wood: true },
  { id: 'cherry', name: 'Cherry', hex: '#8e3f2a', wood: true },
  { id: 'raw', name: 'Raw MDF', hex: '#b8956a' },
  { id: 'ply', name: 'Plywood', hex: '#d8b98a', wood: true },
  { id: 'hdf', name: 'HDF brown', hex: '#8a6a4a' },
  { id: 'green', name: 'Forest green', hex: '#2f5d46' },
  { id: 'blue', name: 'Navy blue', hex: '#26365a' },
  { id: 'sage', name: 'Sage', hex: '#a3b18a' },
  { id: 'terracotta', name: 'Terracotta', hex: '#c0613f' },
];
export const finishById = (id) => FINISHES.find((f) => f.id === id) || (String(id).startsWith('#') ? { id, name: id, hex: id } : FINISHES[0]);

/* ================================================================ default materials (editable in the app) */
export const DEFAULT_MATERIALS = [
  { id: 'mdf18', name: 'MDF 18 mm', kind: 'MDF', T: 18, sheetL: 2440, sheetW: 1220, price: 0, grain: false },
  { id: 'mdf16', name: 'MDF 16 mm', kind: 'MDF', T: 16, sheetL: 2440, sheetW: 1220, price: 0, grain: false },
  { id: 'mdf12', name: 'MDF 12 mm', kind: 'MDF', T: 12, sheetL: 2440, sheetW: 1220, price: 0, grain: false },
  { id: 'mfc18', name: 'Melamine chipboard 18 mm', kind: 'Chipboard', T: 18, sheetL: 2800, sheetW: 2070, price: 0, grain: true },
  { id: 'cb25', name: 'Chipboard 25 mm', kind: 'Chipboard', T: 25, sheetL: 2800, sheetW: 2070, price: 0, grain: false },
  { id: 'ply18', name: 'Plywood 18 mm', kind: 'Plywood', T: 18, sheetL: 2440, sheetW: 1220, price: 0, grain: true },
  { id: 'ply15', name: 'Plywood 15 mm', kind: 'Plywood', T: 15, sheetL: 2440, sheetW: 1220, price: 0, grain: true },
  { id: 'ply12', name: 'Plywood 12 mm', kind: 'Plywood', T: 12, sheetL: 2440, sheetW: 1220, price: 0, grain: true },
  { id: 'hdf3', name: 'HDF 3 mm (backs)', kind: 'HDF', T: 3, sheetL: 2440, sheetW: 1220, price: 0, grain: false },
  { id: 'hdf5', name: 'HDF 5 mm', kind: 'HDF', T: 5, sheetL: 2440, sheetW: 1220, price: 0, grain: false },
  { id: 'wt38', name: 'Worktop 38 mm', kind: 'Worktop', T: 38, sheetL: 3050, sheetW: 600, price: 0, grain: false, trim: 0 },
];

export const DEFAULT_EDGES = [
  { id: 'thin', name: 'PVC 0.4 × 22 mm (inside edges)', thick: 0.4, width: 22, price: 0 },
  { id: 'thick', name: 'PVC 2 × 22 mm (fronts, doors)', thick: 2, width: 22, price: 0 },
  { id: 'wide', name: 'PVC 1 × 42 mm (worktops, thick parts)', thick: 1, width: 42, price: 0 },
];

// Hardware and other items, with a price each (set in Materials)
export const DEFAULT_HARDWARE = {
  hinge: { name: 'Concealed hinge 35 mm (soft close)', unit: 'pcs', price: 0 },
  handle: { name: 'Handle / knob', unit: 'pcs', price: 0 },
  slide: { name: 'Drawer slides (pair)', unit: 'pairs', price: 0 },
  shelfPin: { name: 'Shelf pins', unit: 'pcs', price: 0 },
  camLock: { name: 'Cam lock + dowel (minifix)', unit: 'sets', price: 0 },
  confirmat: { name: 'Confirmat screws 7×50', unit: 'pcs', price: 0 },
  screw: { name: 'Wood screws 4×40', unit: 'pcs', price: 0 },
  nails: { name: 'Back panel nails / staples', unit: 'pcs', price: 0 },
  legKitchen: { name: 'Adjustable cabinet legs', unit: 'pcs', price: 0 },
  plinthClip: { name: 'Plinth clips', unit: 'pcs', price: 0 },
  wallHanger: { name: 'Wall cabinet hangers (pair)', unit: 'pairs', price: 0 },
  rail: { name: 'Wardrobe hanging rail (oval tube)', unit: 'm', price: 0 },
  railHolder: { name: 'Hanging rail holders', unit: 'pcs', price: 0 },
  bedLeg: { name: 'Bed legs', unit: 'pcs', price: 0 },
  bedBolt: { name: 'Bed rail brackets / bolts (set)', unit: 'sets', price: 0 },
  twinLink: { name: 'Twin-bed connector bracket', unit: 'pcs', price: 0 },
  metalBar: { name: 'Steel angle 40×40×4 (bed supports)', unit: 'm', price: 0 },
  metalBox: { name: 'Steel box section 40×20 (center beam)', unit: 'm', price: 0 },
  slat: { name: 'Wooden slats 70×18', unit: 'm', price: 0 },
  batten: { name: 'Timber battens 45×70 (bed supports)', unit: 'm', price: 0 },
  foam: { name: 'Foam + fabric for padded headboard', unit: 'm²', price: 0 },
  wallAnchor: { name: 'Wall anchors (anti-tip)', unit: 'pcs', price: 0 },
  glue: { name: 'Wood glue', unit: 'bottle', price: 0 },
};

/* ================================================================ settings */
export const DEFAULT_SETTINGS = {
  units: 'mm', kerf: 4, trim: 10, cutMode: 'strips', currency: 'ETB',
  edgeExtra: 30, edgeWaste: 10, subtractThick: true,
  labour: 30, profit: 25, shop: 'Anatsi furniture',
};

export function loadLibrary() {
  const lib = storage.get('anatsi.library', null) || {};
  const mergeList = (saved, defaults) => {
    const byId = new Map((saved || []).map((m) => [m.id, m]));
    const out = defaults.map((d) => ({ ...d, ...(byId.get(d.id) || {}) }));
    for (const s of saved || []) if (!defaults.some((d) => d.id === s.id)) out.push(s);
    return out;
  };
  return {
    materials: mergeList(lib.materials, DEFAULT_MATERIALS),
    edges: mergeList(lib.edges, DEFAULT_EDGES),
    hardware: Object.fromEntries(Object.entries(DEFAULT_HARDWARE).map(([k, v]) => [k, { ...v, ...((lib.hardware || {})[k] || {}) }])),
    settings: { ...DEFAULT_SETTINGS, ...(lib.settings || {}) },
  };
}
export function saveLibrary(lib) { storage.set('anatsi.library', lib); }
export const matById = (lib, id) => lib.materials.find((m) => m.id === id) || lib.materials[0];

/* ================================================================ panels
 * A panel is one piece cut from a sheet.
 *  L, W   cut size (L runs along the grain when the board has grain)
 *  T      thickness (from the material)
 *  eL, eW how many long (L) and short (W) edges get edge banding (0, 1 or 2)
 *  edge   'thin' | 'thick' | 'wide'
 *  box    where it sits in 3D: x, y, z = corner nearest the left-bottom-back; w (X), h (Y), d (Z)
 *  role   carcass | door | drawer | shelf | back | deck | head | rail | worktop | plinth …
 */
export function panel(name, o) {
  return {
    id: uid(), name, role: o.role || 'carcass', mat: o.mat, color: o.color,
    L: round1(o.L), W: round1(o.W), eL: o.eL || 0, eW: o.eW || 0, edge: o.edge || 'thin',
    grain: o.grain !== false, box: o.box, door: o.door || null, hinges: o.hinges || null, note: o.note || '',
    group: o.group || '', explode: o.explode || null,
  };
}
export const round1 = (v) => Math.round(v * 10) / 10;
export const r5 = (v) => Math.round(v / 5) * 5;

/* Hinges: how many, and where (measured from the top of the door) */
export function hingeCount(h) {
  if (h <= 900) return 2;
  if (h <= 1600) return 3;
  if (h <= 2000) return 4;
  if (h <= 2400) return 5;
  return 6;
}
export function hingePositions(h, edgeOffset = 100) {
  const n = hingeCount(h);
  const off = Math.max(70, Math.min(edgeOffset, h / 4));
  if (n === 2) return [off, h - off].map(r5);
  const pts = [];
  for (let i = 0; i < n; i++) pts.push(off + ((h - 2 * off) * i) / (n - 1));
  return pts.map(r5);
}

/* How many doors an opening needs (doors wider than ~600 mm sag and swing too far) */
export function autoDoors(width, maxDoor = 600) {
  if (width <= 0) return 0;
  return Math.max(1, Math.ceil(width / maxDoor));
}

/* Shelf sag check: span limits for a loaded shelf (books / dishes), by material */
export function maxShelfSpan(mat) {
  if (!mat) return 800;
  const t = mat.T;
  const k = mat.kind === 'Plywood' ? 1.25 : mat.kind === 'Chipboard' ? 0.85 : 1;
  return Math.round((t >= 25 ? 1000 : t >= 18 ? 750 : t >= 15 ? 600 : 450) * k);
}

/* Units */
export function fmtLen(mm, units = 'mm', withUnit = true) {
  if (units === 'cm') return (Math.round(mm) / 10).toFixed(1).replace(/\.0$/, '') + (withUnit ? ' cm' : '');
  if (units === 'in') return (mm / 25.4).toFixed(2).replace(/\.?0+$/, '') + (withUnit ? '″' : '');
  return Math.round(mm * 10) / 10 + (withUnit ? ' mm' : '');
}
export function toMM(v, units = 'mm') { return units === 'cm' ? v * 10 : units === 'in' ? v * 25.4 : v; }
export function fromMM(v, units = 'mm') { return units === 'cm' ? v / 10 : units === 'in' ? v / 25.4 : v; }

// Split a panel that is bigger than the sheet into equal pieces that fit
export function splitToFit(L, W, sheet, trim = 10) {
  trim = sheet.trim ?? trim; // some boards (worktops) come finished: no edge trim
  const sl = sheet.sheetL - 2 * trim;
  const sw = sheet.sheetW - 2 * trim;
  const fits = (a, b) => (a <= sl && b <= sw) || (a <= sw && b <= sl);
  if (fits(L, W)) return { pieces: 1, L, W, along: null };
  for (let n = 2; n <= 8; n++) {
    if (fits(L / n, W)) return { pieces: n, L: L / n, W, along: 'L' };
    if (fits(L, W / n)) return { pieces: n, L, W: W / n, along: 'W' };
  }
  return { pieces: 1, L, W, along: null, tooBig: true };
}

/* Bed / mattress sizes (mattress width × length, mm) */
export const MATTRESS = {
  single: { name: 'Single', w: 900, l: 1900, region: 'Common' },
  single200: { name: 'Single long', w: 900, l: 2000, region: 'Common / EU' },
  twin: { name: 'Twin (hotel)', w: 1000, l: 2000, region: 'Hotel' },
  twinUS: { name: 'Twin (US)', w: 990, l: 1905, region: 'US' },
  twinXL: { name: 'Twin XL (US)', w: 990, l: 2032, region: 'US' },
  small: { name: 'Small double', w: 1200, l: 1900, region: 'Common' },
  double: { name: 'Double', w: 1400, l: 1900, region: 'Common' },
  full: { name: 'Full (US)', w: 1372, l: 1905, region: 'US' },
  queen: { name: 'Queen', w: 1600, l: 2000, region: 'Common / EU' },
  queenUS: { name: 'Queen (US)', w: 1524, l: 2032, region: 'US' },
  king: { name: 'King', w: 1800, l: 2000, region: 'Common / EU' },
  kingUS: { name: 'King (US)', w: 1930, l: 2032, region: 'US' },
  superking: { name: 'Super king', w: 2000, l: 2000, region: 'EU' },
};
