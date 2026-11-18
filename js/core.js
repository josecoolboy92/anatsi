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
  { id: 'hdf', name: 'Raw (backs)', hex: '#8a6a4a' },
  { id: 'green', name: 'Forest green', hex: '#2f5d46' },
  { id: 'blue', name: 'Navy blue', hex: '#26365a' },
  { id: 'sage', name: 'Sage', hex: '#a3b18a' },
  { id: 'terracotta', name: 'Terracotta', hex: '#c0613f' },
];
export const finishById = (id) => FINISHES.find((f) => f.id === id) || (String(id).startsWith('#') ? { id, name: id, hex: id } : FINISHES[0]);

/* ================================================================ materials (editable in the app)
 * Two sets: boards you can buy in Ethiopia (with market prices in ETB) and an international "standard" set.
 * price = low price, priceHi = high price (prices differ shop to shop); the cost uses the level in Settings.
 */
const ET = (id, name, kind, T, price, priceHi, o = {}) => ({ id, name, kind, T, sheetL: 2440, sheetW: 1220, price, priceHi: priceHi || price, grain: false, region: 'et', ...o });
export const DEFAULT_MATERIALS = [
  // Ethiopia market (2440 × 1220 sheets). Prices from the market, Nov 2026: edit them in Materials.
  ET('et-mdf3', 'Normal MDF 3 mm', 'MDF', 3, 830, 850),
  ET('et-mdf3L', 'Laminated MDF 3 mm', 'Laminated MDF', 3, 1400, 1500),
  ET('et-phizit', 'Phizit (thin back board)', 'Board', 3, 550, 550, { note: 'Cheapest backs and drawer bottoms. Check the thickness at your shop.' }),
  ET('et-mdf6', 'Normal MDF 6 mm', 'MDF', 6, 1500, 1530),
  ET('et-mdf6L', 'Laminated MDF 6 mm', 'Laminated MDF', 6, 2100, 2100),
  ET('et-oak6', 'Oak MDF 6 mm', 'Veneer MDF', 6, 2500, 2500, { grain: true }),
  ET('et-mdf10', 'Normal MDF 10 mm', 'MDF', 10, 2100, 2300),
  ET('et-oak10', 'Oak MDF 10 mm', 'Veneer MDF', 10, 3800, 3800, { grain: true }),
  ET('et-mdf12', 'Normal MDF 12 mm', 'MDF', 12, 3000, 3000),
  ET('et-mdf18', 'Normal MDF 18 mm', 'MDF', 18, 3700, 3700),
  ET('et-mdf18L', 'Laminated MDF 18 mm', 'Laminated MDF', 18, 5450, 5450),
  ET('et-dukem18', 'Dukem MDF 18 mm', 'MDF', 18, 3800, 3800),
  ET('et-dukem18L', 'Dukem laminated MDF 18 mm', 'Laminated MDF', 18, 5100, 5100),
  ET('et-hawassa18', 'Hawassa MDF 18 mm', 'MDF', 18, 3900, 3900),
  ET('et-hawassa18L', 'Hawassa laminated MDF 18 mm', 'Laminated MDF', 18, 5600, 5600),
  ET('et-safarian18', 'Safarian 18 mm', 'Board', 18, 4800, 4800),
  ET('et-chip18', 'Chipwood (chipboard) 18 mm', 'Chipboard', 18, 0, 0, { note: 'Type your price.' }),
  ET('et-comp', 'Compensato (thin plywood)', 'Plywood', 4, 900, 900, { grain: true }),
  ET('et-ply6', 'Plywood 6 mm', 'Plywood', 6, 1680, 1680, { grain: true }),
  ET('et-ply8', 'Plywood 8 mm', 'Plywood', 8, 2050, 2050, { grain: true }),
  ET('et-ply10', 'Plywood 10 mm', 'Plywood', 10, 2300, 2300, { grain: true }),
  ET('et-ply12', 'Plywood 12 mm', 'Plywood', 12, 3150, 3150, { grain: true }),
  // international standard set
  { id: 'mdf18', name: 'MDF 18 mm', kind: 'MDF', T: 18, sheetL: 2440, sheetW: 1220, price: 0, grain: false, region: 'std' },
  { id: 'mdf16', name: 'MDF 16 mm', kind: 'MDF', T: 16, sheetL: 2440, sheetW: 1220, price: 0, grain: false, region: 'std' },
  { id: 'mdf12', name: 'MDF 12 mm', kind: 'MDF', T: 12, sheetL: 2440, sheetW: 1220, price: 0, grain: false, region: 'std' },
  { id: 'mdf6', name: 'MDF 6 mm', kind: 'MDF', T: 6, sheetL: 2440, sheetW: 1220, price: 0, grain: false, region: 'std' },
  { id: 'mfc18', name: 'Melamine chipboard 18 mm', kind: 'Chipboard', T: 18, sheetL: 2800, sheetW: 2070, price: 0, grain: true, region: 'std' },
  { id: 'cb25', name: 'Chipboard 25 mm', kind: 'Chipboard', T: 25, sheetL: 2800, sheetW: 2070, price: 0, grain: false, region: 'std' },
  { id: 'ply18', name: 'Plywood 18 mm', kind: 'Plywood', T: 18, sheetL: 2440, sheetW: 1220, price: 0, grain: true, region: 'std' },
  { id: 'ply15', name: 'Plywood 15 mm', kind: 'Plywood', T: 15, sheetL: 2440, sheetW: 1220, price: 0, grain: true, region: 'std' },
  { id: 'ply12', name: 'Plywood 12 mm', kind: 'Plywood', T: 12, sheetL: 2440, sheetW: 1220, price: 0, grain: true, region: 'std' },
  { id: 'hdf3', name: 'HDF 3 mm (backs)', kind: 'HDF', T: 3, sheetL: 2440, sheetW: 1220, price: 0, grain: false, region: 'std' },
  { id: 'hdf5', name: 'HDF 5 mm', kind: 'HDF', T: 5, sheetL: 2440, sheetW: 1220, price: 0, grain: false, region: 'std' },
  // both
  { id: 'wt38', name: 'Worktop 38 mm', kind: 'Worktop', T: 38, sheetL: 3050, sheetW: 600, price: 0, grain: false, trim: 0, region: 'all' },
];

/* What each job uses by default, per set. Model settings point at these roles ("@carcass"), so a design
 * switches boards automatically when you change between the Ethiopian and standard sets. */
export const ROLE_MATS = {
  et: { carcass: 'et-mdf18', door: 'et-mdf18L', back: 'et-mdf3', thin: 'et-mdf6', deck: 'et-ply12', deckLight: 'et-ply10', pad: 'et-mdf6', drawer: 'et-mdf12', strip: 'et-mdf18', worktop: 'wt38' },
  std: { carcass: 'mdf18', door: 'mdf18', back: 'hdf3', thin: 'mdf6', deck: 'ply18', deckLight: 'ply12', pad: 'mdf12', drawer: 'mdf18', strip: 'mdf18', worktop: 'wt38' },
};
export const ROLE_NAMES = { carcass: 'Carcass board', door: 'Doors & fronts', back: 'Backs & drawer bottoms', thin: 'Thin parts', deck: 'Bed deck', deckLight: 'Bed deck (economy)', pad: 'Upholstery base', drawer: 'Drawer boxes', strip: 'Strips & slats', worktop: 'Worktop' };
// The board used for a role in the current set, or the board itself if it's a normal id
export function roleMat(lib, id) {
  if (typeof id !== 'string' || !id.startsWith('@')) return id;
  const region = (lib.settings && lib.settings.region) || 'et';
  const r = id.slice(1);
  return (lib.roles && lib.roles[region] && lib.roles[region][r]) || ROLE_MATS[region][r] || ROLE_MATS.et[r];
}
// Price used for costs: low, middle or high of the shop range
export function priceOf(item, lib) {
  if (!item) return 0;
  const lo = Number(item.price) || 0;
  const hi = Number(item.priceHi) || lo;
  const lvl = (lib && lib.settings && lib.settings.priceLevel) || 'mid';
  return lvl === 'low' ? lo : lvl === 'high' ? Math.max(lo, hi) : (lo + Math.max(lo, hi)) / 2;
}

export const DEFAULT_EDGES = [
  { id: 'thin', name: 'PVC 0.4 × 22 mm (inside edges)', thick: 0.4, width: 22, price: 0 },
  { id: 'thick', name: 'PVC 2 × 22 mm (fronts, doors)', thick: 2, width: 22, price: 0 },
  { id: 'wide', name: 'PVC 1 × 42 mm (worktops, thick parts)', thick: 1, width: 42, price: 0 },
];

// Hardware and other items, with a price each (set in Materials)
export const DEFAULT_HARDWARE = {
  hingeStd: { name: 'Concealed hinge 35 mm (normal, clip-on)', unit: 'pcs', price: 0 },
  hinge: { name: 'Concealed hinge 35 mm (soft close)', unit: 'pcs', price: 0 },
  hinge3D: { name: 'Concealed hinge 35 mm (soft close, 3D adjust, heavy)', unit: 'pcs', price: 0 },
  hingeWide: { name: 'Wide-angle hinge 165°', unit: 'pcs', price: 0 },
  pushLatch: { name: 'Push-to-open latch', unit: 'pcs', price: 0 },
  flapStay: { name: 'Lift-up flap stay / gas strut (pair)', unit: 'pairs', price: 0 },
  slideRoller: { name: 'Roller drawer runners (pair)', unit: 'pairs', price: 0 },
  handle: { name: 'Handle / knob', unit: 'pcs', price: 0 },
  slide: { name: 'Ball-bearing drawer slides (pair)', unit: 'pairs', price: 0 },
  slideSoft: { name: 'Soft-close undermount slides (pair)', unit: 'pairs', price: 0 },
  shelfPin: { name: 'Shelf pins', unit: 'pcs', price: 0 },
  camLock: { name: 'Cam lock + dowel (minifix)', unit: 'sets', price: 0 },
  confirmat: { name: 'Confirmat screws 7×50', unit: 'pcs', price: 0 },
  screw: { name: 'Wood screws 4×40', unit: 'pcs', price: 0 },
  nails: { name: 'Back panel nails / staples', unit: 'pcs', price: 0 },
  legKitchen: { name: 'Adjustable cabinet legs', unit: 'pcs', price: 0 },
  plinthClip: { name: 'Plinth clips', unit: 'pcs', price: 0 },
  wallHanger: { name: 'Wall cabinet hangers (pair)', unit: 'pairs', price: 0 },
  railRound: { name: 'Round chrome rail 19 mm', unit: 'm', price: 0 },
  rail: { name: 'Wardrobe hanging rail (oval tube 30×15)', unit: 'm', price: 0 },
  railSteel: { name: 'Steel oval rail 30×15×1.5 (heavy)', unit: 'm', price: 0 },
  hooks: { name: 'Coat hooks', unit: 'pcs', price: 0 },
  railHolder: { name: 'Hanging rail holders', unit: 'pcs', price: 0 },
  bedLeg: { name: 'Bed legs', unit: 'pcs', price: 0 },
  bedBolt: { name: 'Bed rail brackets / bolts (set)', unit: 'sets', price: 0 },
  twinLink: { name: 'Twin-bed connector bracket', unit: 'pcs', price: 0 },
  angle30: { name: 'Steel angle 30×30×3', unit: 'm', price: 0 },
  metalBar: { name: 'Steel angle 40×40×4', unit: 'm', price: 0 },
  tube25: { name: 'Square tube 25×25×1.5', unit: 'm', price: 0 },
  rhs4020: { name: 'Rectangular tube 40×20×1.5', unit: 'm', price: 0 },
  metalBox: { name: 'Rectangular tube 40×20×2 (center beam)', unit: 'm', price: 0 },
  shs30: { name: 'Square tube 30×30×1.5 (cabinet frames)', unit: 'm', price: 0 },
  shs40: { name: 'Square tube 40×40×2 (strong bed frame)', unit: 'm', price: 0 },
  gusset: { name: 'Corner gusset plates 3 mm', unit: 'pcs', price: 0 },
  bolt8: { name: 'M8 bolts + nuts (frame to rails)', unit: 'pcs', price: 0 },
  adjFoot: { name: 'Adjustable steel feet M10', unit: 'pcs', price: 0 },
  weld: { name: 'Welding + anti-rust paint (per frame)', unit: 'frames', price: 0 },
  slat: { name: 'Wooden slats 70×18', unit: 'm', price: 0 },
  batten: { name: 'Timber battens 45×70 (bed supports)', unit: 'm', price: 0 },
  fabric: { name: 'Upholstery fabric (1.4 m wide)', unit: 'm', price: 0 },
  foam25: { name: 'Foam sheet 25 mm (1 × 2 m)', unit: 'sheets', price: 0 },
  foam50: { name: 'Foam sheet 50 mm (1 × 2 m)', unit: 'sheets', price: 0 },
  foam75: { name: 'Foam sheet 75 mm (1 × 2 m)', unit: 'sheets', price: 0 },
  dacron: { name: 'Dacron / batting (1.5 m wide)', unit: 'm', price: 0 },
  buttons: { name: 'Covered buttons', unit: 'pcs', price: 0 },
  staples: { name: 'Upholstery staples', unit: 'boxes', price: 0 },
  sprayGlue: { name: 'Foam spray glue', unit: 'cans', price: 0 },
  cleat: { name: 'French cleat / Z-clip (pair)', unit: 'pairs', price: 0 },
  socketBox: { name: 'Socket cut-out + extension box', unit: 'pcs', price: 0 },
  wallAnchor: { name: 'Wall anchors (anti-tip)', unit: 'pcs', price: 0 },
  glue: { name: 'Wood glue', unit: 'bottle', price: 0 },
};

/* ================================================================ settings */
export const DEFAULT_SETTINGS = {
  units: 'mm', kerf: 4, trim: 10, cutMode: 'strips', currency: 'ETB',
  edgeExtra: 30, edgeWaste: 10, subtractThick: true,
  labour: 30, profit: 25, shop: 'Anatsi furniture',
  region: 'et', priceLevel: 'mid',
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
    roles: lib.roles || { et: { ...ROLE_MATS.et }, std: { ...ROLE_MATS.std } },
  };
}
export function saveLibrary(lib) { storage.set('anatsi.library', lib); }
export const matById = (lib, id) => { const r = roleMat(lib, id); return lib.materials.find((m) => m.id === r) || lib.materials.find((m) => m.id === ROLE_MATS.et.carcass) || lib.materials[0]; };

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

/* Hinge types. "crank" is how far the arm is bent: it decides how much the door covers the side panel. */
export const HINGE_TYPES = {
  full: { name: 'Full overlay (straight arm)', crank: 0, overlay: '16–18 mm: the door covers the whole side edge', use: 'End doors of a cabinet: the usual kitchen / wardrobe door.' },
  half: { name: 'Half overlay (slight crank 9.5 mm)', crank: 9.5, overlay: '≈8 mm: two doors share one divider', use: 'Doors that meet on a middle divider. The app uses these automatically there.' },
  inset: { name: 'Inset (big crank 18 mm)', crank: 18, overlay: '0 mm: the door sits inside the box, flush with the front', use: 'Classic look. Needs accurate 2–3 mm gaps all round.' },
  wide: { name: 'Wide angle 165°', crank: 0, overlay: 'Full overlay, opens to 165°', use: 'Corner cabinets, doors next to a wall, doors in front of pull-out drawers.' },
  push: { name: 'Push-to-open (no handles)', crank: 0, overlay: 'Full overlay hinge without spring + push latch', use: 'Handle-less modern fronts.' },
  flap: { name: 'Lift-up flap (hinged at the top)', crank: 0, overlay: 'Full overlay, opens upward with a gas strut / stay', use: 'Wall cabinets above the hood or fridge, low wide cabinets.' },
};
/* How to drill and screw the hinges, per board */
export function hingeGuide(type, doorT = 18, matKind = 'MDF') {
  const ht = HINGE_TYPES[type] || HINGE_TYPES.full;
  const depth = doorT >= 18 ? 13 : doorT >= 16 ? 12 : 11;
  const steps = [
    `Hinge: ${ht.name}. ${ht.overlay}.`,
    `Cup hole: Ø35 mm Forstner bit, ${depth} mm deep in the back of the door (door is ${doorT} mm: never deeper than ${doorT - 5} mm). Use a drill stand or a hinge jig so the hole is square.`,
    'Cup position: hole centre 22.5 mm from the hinge edge of the door (the hole edge is 5 mm from the door edge). Hinge centres as shown, at least 70–100 mm from the top and bottom.',
    `Cup screws: 2 per hinge, ${matKind.includes('Plywood') ? '3.5 × 16 mm chipboard screws' : 'euro screws 6.3 × 13 mm in Ø5 mm holes, or 3.5 × 16 mm screws in a Ø2.5 mm pilot hole'}. On MDF always pre-drill, or the face swells and splits.`,
    'Mounting plate on the side panel: line its centre up with the cup centre, front screw hole 37 mm from the front edge, holes 32 mm apart (System 32). 2 screws 3.5 × 16 mm, or euro screws.',
    'Clip the arm onto the plate, then adjust with the 3 screws: side (door gap), height (lines doors up) and depth (gap to the cabinet front). Leave a 2–3 mm gap between doors.',
  ];
  if (type === 'half') steps.push('Two doors on one divider: both use half-overlay hinges, plates on each side of the divider at the same height.');
  if (type === 'inset') steps.push('Inset: the door is 4–6 mm smaller than the opening (2–3 mm gap each side). The plate sits 37 mm + door thickness back from the front edge.');
  if (type === 'push') steps.push('Push latch: screw it inside the cabinet near the opening edge, opposite the hinges, 10 mm behind the front edge. Use hinges without springs.');
  if (type === 'flap') steps.push('Lift-up flap: 2 hinges along the TOP edge of the door; fix a gas strut or flap stay on each side (choose its force by the door weight: about 6 kg per m² for 18 mm MDF).');
  if (type === 'wide') steps.push('Wide angle hinges need a plate with 0 mm spacing; check the door clears the wall or the next door when opened.');
  steps.push('Never screw into the MDF edge without a pilot hole, and don’t over-tighten: MDF threads strip. If a hole strips, glue in a hardwood dowel and drill again.');
  return steps;
}

/* Build grades: what changes between cheap, medium (good for years) and strong. */
export const GRADES = {
  economy: { name: 'Economy (cheap)', hinge: 'hingeStd', slide: 'slideRoller', rail: 'railRound', back: 'nailed', note: 'Normal MDF painted, nailed backs, normal hinges and roller runners. Fine for light use.' },
  medium: { name: 'Medium (fair for long-term use)', hinge: 'hinge', slide: 'slide', rail: 'rail', back: 'nailed', note: 'Laminated fronts, soft-close hinges, ball-bearing slides, screwed + glued joints.' },
  strong: { name: 'Strong (most durable)', hinge: 'hinge3D', slide: 'slideSoft', rail: 'railSteel', back: 'screwed', note: 'Laminated 18 mm everywhere, heavy 3D hinges, soft-close undermount slides, steel frames, screwed backs.' },
};

/* Steel arrangements under a bed deck, from cheapest to strongest */
export const BED_METAL = {
  economy: { name: 'Economy steel', cross: 'tube25', crossName: 'Square tube 25×25×1.5', crossH: 25, spacing: 500, ledger: null, beam: 'rhs4020', beamLegs: 1, perimeter: null, legsExtra: 0,
    note: 'Cross tubes 25×25×1.5 every ~500 mm, sitting on the MDF holder strips, 2 screws each end. Center tube + 1 leg on wide beds. Cheapest; fine for home use.' },
  medium: { name: 'Medium steel (long-term use)', cross: 'rhs4020', crossName: 'Rectangular tube 40×20×1.5 (on edge)', crossH: 40, spacing: 400, ledger: 'angle30', beam: 'metalBox', beamLegs: 2, perimeter: null, legsExtra: 0,
    note: 'Steel angle 30×30×3 screwed along the inside of both side rails (on the holder strips); cross tubes 40×20 on edge every ~400 mm, welded or bolted to the angles. Center beam 40×20×2 with 2 legs on beds over 1300 mm.' },
  strong: { name: 'Strong welded frame (hotel / heaviest)', cross: 'rhs4020', crossName: 'Rectangular tube 40×20×1.5 (on edge)', crossH: 40, spacing: 300, ledger: null, beam: 'shs40', beamLegs: 3, perimeter: 'shs40', legsExtra: 2,
    note: 'A welded frame of square tube 40×40×2 all round, cross tubes 40×20 every ~300 mm, center beam 40×40 with 3 legs, corner gusset plates. The frame is bolted to the MDF rails with M8 bolts, so the MDF only hides the steel. Paint it against rust.' },
};

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
