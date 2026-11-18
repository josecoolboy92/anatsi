// The cabinet "box" (carcass) builder shared by kitchen cabinets, cupboards, wardrobes and nightstands.
// Frameless construction: sides run full height, bottom/top/shelves fit between the sides,
// doors overlay the front, back panel nailed on.
import { panel, hingePositions, autoDoors, maxShelfSpan, r5, splitToFit, matById, GRADES, HINGE_TYPES } from './core.js';

/*
 o = {
   x0, y0, z0          position of the box (left, bottom, back), mm
   W, H, D, T          outer width, height (without plinth/legs), depth (without back/doors), board thickness
   mat, color          carcass material id + finish id
   doorMat, doorColor, doorT, doorEdge ('thick' | 'none')
   backMat, backT, back ('nailed' | 'none')
   drawerMat, drawerT, hdfMat
   top: 'full' | 'rails' | 'over'
   sections: [{ shelves, adjustable, drawers, drawerFill, drawerPos ('bottom'|'top'), drawerH, rail,
                doors ('auto'|0|1|2|3|4), open, split (height of a door split / fixed shelf from the bottom), hinge ('L'|'R') }]
   gap (door gap), maxDoor, visibleBottom, prefix, shelfSetback
 }
 out = { panels: [], hw: {}, linear: [], notes: [], warnings: [] }
*/
export function carcass(o, out, lib) {
  const { x0 = 0, y0 = 0, z0 = 0, W, H, D, T } = o;
  const g = o.gap ?? 3;
  const pre = o.prefix ? o.prefix + ' · ' : '';
  const add = (name, opt) => {
    const p = panel(pre + name, { mat: o.mat, color: o.color, group: o.prefix || '', ...opt });
    out.panels.push(p);
    return p;
  };
  const hw = (k, n) => { out.hw[k] = (out.hw[k] || 0) + n; };
  const mat = matById(lib, o.mat);
  const G = GRADES[o.grade] || GRADES.medium;
  o.G = G;
  o.lib = lib;

  const topOver = o.top === 'over';
  const sideH = topOver ? H - T : H;
  const inW = W - 2 * T;
  // sides
  add('Side (left)', { L: sideH, W: D, eL: 1, eW: o.visibleBottom ? 1 : 0, box: { x: x0, y: y0, z: z0, w: T, h: sideH, d: D }, explode: [-1, 0, 0] });
  add('Side (right)', { L: sideH, W: D, eL: 1, eW: o.visibleBottom ? 1 : 0, box: { x: x0 + W - T, y: y0, z: z0, w: T, h: sideH, d: D }, explode: [1, 0, 0] });
  // bottom
  add('Bottom', { L: inW, W: D, eL: 1, grain: true, box: { x: x0 + T, y: y0, z: z0, w: inW, h: T, d: D }, explode: [0, -1, 0] });
  // top
  if (o.top === 'rails') {
    const rw = 100;
    add('Top rail (front)', { L: inW, W: rw, eL: 1, box: { x: x0 + T, y: y0 + H - T, z: z0 + D - rw, w: inW, h: T, d: rw }, explode: [0, 1, 0.3] });
    add('Top rail (back)', { L: inW, W: rw, box: { x: x0 + T, y: y0 + H - T, z: z0, w: inW, h: T, d: rw }, explode: [0, 1, -0.3] });
  } else if (topOver) {
    add('Top', { L: W, W: D, eL: 1, eW: 2, box: { x: x0, y: y0 + H - T, z: z0, w: W, h: T, d: D }, explode: [0, 1, 0] });
  } else {
    add('Top', { L: inW, W: D, eL: 1, box: { x: x0 + T, y: y0 + H - T, z: z0, w: inW, h: T, d: D }, explode: [0, 1, 0] });
  }
  let joints = 4; // corner joints for screws

  const yIn0 = y0 + T;
  const yIn1 = y0 + H - T;
  const inH = yIn1 - yIn0;
  const secs = o.sections && o.sections.length ? o.sections : [{}];
  const n = secs.length;
  const free = inW - (n - 1) * T;
  const shares = secs.map((s) => Math.max(0.1, Number(s.share) || 1));
  const shareSum = shares.reduce((a, b) => a + b, 0);
  const widths = shares.map((k) => (free * k) / shareSum);
  const starts = widths.map((_, i) => x0 + T + widths.slice(0, i).reduce((a, b) => a + b, 0) + i * T);
  const secW = Math.max(...widths);
  const setback = o.shelfSetback ?? 20;
  const span = maxShelfSpan(mat);

  secs.forEach((s, i) => {
    let splitY = null;
    const secW = widths[i];
    const xs = starts[i];
    if (secW > span && ((s.shelves | 0) > 0 || s.rail)) out.warnings.push(`${pre}Shelves${n > 1 ? ` in section ${i + 1}` : ''} are ${Math.round(secW)} mm wide. ${mat ? mat.name : 'This board'} can sag under load beyond about ${span} mm: add a divider, a center support, or use a thicker board.`);
    if (i > 0) {
      add(`Divider ${i}`, { L: inH, W: D - (o.dividerSetback || 0), eL: 1, box: { x: xs - T, y: yIn0, z: z0, w: T, h: inH, d: D - (o.dividerSetback || 0) }, explode: [0, 0, 0.2] });
      joints += 2;
    }
    const secName = n > 1 ? ` (section ${i + 1})` : '';

    // ---- drawers
    const nd = Math.max(0, s.drawers | 0);
    let zone0 = yIn0; // free vertical zone for shelves/doors
    let zone1 = yIn1;
    const doorZones = []; // [bottom, top] outer heights that doors must cover
    let frontsZone = null;
    if (nd) {
      const fill = !!s.drawerFill;
      const each = s.drawerH || 200;
      const zoneH = fill ? inH : Math.min(inH - 150, nd * each);
      const top = s.drawerPos === 'top';
      const dz0 = top ? yIn1 - zoneH : yIn0;
      const dz1 = dz0 + zoneH;
      if (!fill) {
        // a fixed shelf separates the drawers from the rest
        const ys = top ? dz0 - T : dz1;
        add('Fixed shelf' + secName, { L: secW, W: D - setback, eL: 1, role: 'shelf', box: { x: xs, y: ys, z: z0, w: secW, h: T, d: D - setback } });
        joints += 2;
        if (top) zone1 = ys; else zone0 = ys + T;
      } else { zone0 = zone1 = 0; }
      // outer front zone (fronts overlay the box edges)
      const f0 = top ? (fill ? y0 : dz0 - T / 2) : y0;
      const f1 = top ? y0 + H : (fill ? y0 + H : dz1 + T / 2);
      frontsZone = [f0, f1];
      const zx0 = i === 0 ? x0 : xs - T / 2;
      const zx1 = i === n - 1 ? x0 + W : xs + secW + T / 2;
      drawers(o, out, add, hw, { n: nd, xs, secW, zx0, zx1, f0, f1, inner0: dz0, inner1: dz1, z0, D, secName });
      if (!fill) doorZones.push(top ? [y0, f0] : [f1, y0 + H]);
    } else if (s.split) {
      // two rows of doors with a fixed shelf between (tall cabinets)
      const ys = r5(yIn0 + s.split);
      splitY = ys;
      add('Fixed shelf' + secName, { L: secW, W: D - setback, eL: 1, role: 'shelf', box: { x: xs, y: ys, z: z0, w: secW, h: T, d: D - setback } });
      joints += 2;
      doorZones.push([y0, ys + T / 2]);
      if (!s.lowerDoorsOnly) doorZones.push([ys + T / 2, y0 + H]);
    } else {
      doorZones.push([y0, y0 + H]);
    }

    // ---- hanging rail (wardrobes): sits under a top shelf
    let railY = null;
    if (s.rail && zone1 - zone0 > 900) {
      const shelfY = zone1 - 320; // hat shelf 300 mm below the top
      add('Hat shelf' + secName, { L: secW, W: D - setback, eL: 1, role: 'shelf', box: { x: xs, y: shelfY, z: z0, w: secW, h: T, d: D - setback } });
      joints += 2;
      railY = shelfY - 60;
      out.linear.push({ key: G.rail, name: 'Hanging rail' + secName, len: secW - 4, qty: 1 });
      hw('railHolder', secW > 1000 ? 3 : 2);
      if (secW > 1000) out.notes.push(`${pre}Rail${secName} is ${Math.round(secW)} mm long: add a middle rail support from the hat shelf.`);
      zone1 = shelfY;
      // hanging space needs ~1000 (shirts) to 1600 (dresses/coats)
      if (railY - zone0 < 1000) out.warnings.push(`${pre}Hanging space${secName} is only ${Math.round(railY - zone0)} mm. Shirts need about 1000 mm, long coats 1600 mm.`);
      out.rails = out.rails || [];
      out.rails.push({ x: xs + 2, y: railY, z: z0 + (D - setback) / 2, len: secW - 4 });
    }

    // ---- shelves, evenly spaced in the free zone
    const ns = s.rail ? 0 : Math.max(0, s.shelves | 0);
    if (ns && zone1 > zone0) {
      const adj = s.adjustable !== false;
      const sw = adj ? secW - 2 : secW;
      const sd = D - setback;
      // shelves are shared between the zones above and below a fixed middle shelf, by height
      const zones = splitY !== null ? [[zone0, splitY], [splitY + T, zone1]] : [[zone0, zone1]];
      const total = zones.reduce((a, [p, q]) => a + Math.max(0, q - p), 0);
      let left = ns;
      zones.forEach(([za, zb], zi) => {
        const cnt = zi === zones.length - 1 ? left : Math.round((ns * Math.max(0, zb - za)) / total);
        left -= cnt;
        const step = (zb - za + T) / (cnt + 1);
        for (let k = 1; k <= cnt; k++) {
          const y = za + step * k - T;
          add((adj ? 'Shelf' : 'Fixed shelf') + secName, { L: sw, W: sd, eL: 1, role: 'shelf', box: { x: xs + (adj ? 1 : 0), y, z: z0, w: sw, h: T, d: sd }, explode: [0, 0, 1] });
        }
      });
      if (adj) {
        hw('shelfPin', 4 * ns);
        out.notes.push(`${pre}Shelf pin holes${secName}: Ø5 mm, 37 mm from the front and back edges, every 32 mm (System 32).`);
      } else joints += 2 * ns;
    }

    // ---- doors
    if (!s.open) {
      const zx0 = i === 0 ? x0 : xs - T / 2;
      const zx1 = i === n - 1 ? x0 + W : xs + secW + T / 2;
      for (const [zy0, zy1] of doorZones) doors(o, out, add, hw, { zx0, zx1, zy0, zy1, z: z0 + D, s, secName, rows: doorZones.length, xs, secW, yIn0, yIn1, y0, H, x0, W, z0, D });
    }
  });

  // ---- back panel
  if (o.back !== 'none') {
    const bt = o.backT || 3;
    const sheet = matById(lib, o.backMat);
    // a back bigger than one sheet is made of strips that join behind a divider or a batten
    const sp = splitToFit(W - 4, H - 4, sheet, lib.settings ? lib.settings.trim : 10);
    const cols = sp.along === 'L' ? sp.pieces : 1;
    const rows = sp.along === 'W' ? sp.pieces : 1;
    const pw = (W - 4) / cols;
    const ph = (H - 4) / rows;
    for (let a = 0; a < cols; a++) for (let b = 0; b < rows; b++) {
      add('Back panel' + (cols * rows > 1 ? ` ${a * rows + b + 1}/${cols * rows}` : ''), { mat: o.backMat, color: o.backColor || 'hdf', L: Math.max(ph, pw), W: Math.min(ph, pw), role: 'back', grain: false, box: { x: x0 + 2 + a * pw, y: y0 + 2 + b * ph, z: z0 - bt, w: pw, h: ph, d: bt }, explode: [0, 0, -1.5] });
    }
    if (cols * rows > 1) out.notes.push(`${pre}Back is bigger than one ${sheet.name} sheet: ${cols * rows} pieces. Make the joint${cols * rows > 2 ? 's' : ''} land on a divider, shelf or a batten so it can be nailed.`);
    const fixings = Math.ceil((2 * (W + H)) / (G.back === 'screwed' ? 150 : 100)) + (cols * rows - 1) * Math.ceil(Math.max(W, H) / 100);
    if (G.back === 'screwed') { hw('screw', fixings); out.notes.push(`${pre}Back: ${sheet.T} mm, glued and screwed every 150 mm (3.5×16 screws): keeps the cabinet square for years.`); }
    else hw('nails', fixings);
  }
  hw('confirmat', joints * 3);
  return { inW, widths, yIn0, yIn1 };
}

function doors(o, out, add, hw, { zx0, zx1, zy0, zy1, z, s, secName, rows, xs, secW, yIn0, yIn1, y0, H, x0, W }) {
  const g = o.gap ?? 3;
  const type = o.hingeType || 'full';
  const inset = type === 'inset';
  const T = o.T;
  // door area: overlay doors cover the box edges; inset doors sit inside the opening
  let ax0 = zx0, ax1 = zx1, ay0 = zy0, ay1 = zy1;
  if (inset) {
    ax0 = xs; ax1 = xs + secW;
    ay0 = zy0 <= y0 + 1 ? yIn0 : zy0 + T / 2;
    ay1 = zy1 >= y0 + H - 1 ? yIn1 : zy1 - T / 2;
  }
  const zw = ax1 - ax0;
  const flap = type === 'flap';
  const count = flap ? 1 : s.doors === undefined || s.doors === 'auto' ? autoDoors(zw, o.maxDoor || 600) : Number(s.doors);
  if (!count) return;
  const gg = inset ? g : 0; // inset: gap on the outer edges too
  const dw = (zw - g * count - (inset ? g : 0)) / count;
  const dh = ay1 - ay0 - g - (inset ? g : 0);
  const dt = o.doorT || o.T;
  const thick = o.doorEdge !== 'none';
  const G = o.G || GRADES.medium;
  for (let k = 0; k < count; k++) {
    const x = ax0 + (inset ? g : g / 2) + k * (dw + g);
    const hinge = flap ? 'T' : s.dropDown ? 'B' : count === 1 ? (s.hinge || 'L') : (k % 2 === 0 ? 'L' : 'R');
    // the hinge edge sits on a divider (not the outer side) → half overlay
    const onDivider = !inset && !flap && ((hinge === 'L' && zx0 > x0 + 1) || (hinge === 'R' && zx1 < x0 + W - 1));
    const htype = inset ? 'inset' : flap ? 'flap' : s.dropDown ? 'flap' : onDivider && (type === 'full' || type === 'push') ? 'half' : type;
    const along = hinge === 'T' || hinge === 'B' ? dw : dh;
    const hp = hingePositions(along);
    const key = type === 'wide' ? 'hingeWide' : G.hinge;
    const where = hinge === 'T' ? 'along the top edge' : hinge === 'B' ? 'along the bottom edge' : `on the ${hinge === 'L' ? 'left' : 'right'}`;
    add('Door' + secName + (rows > 1 ? (zy0 < (o.y0 || 0) + 10 ? ' (lower)' : ' (upper)') : ''), {
      mat: o.doorMat || o.mat, color: o.doorColor || o.color, L: dh, W: dw, eL: thick ? 2 : 0, eW: thick ? 2 : 0, edge: 'thick', role: 'door',
      box: { x, y: ay0 + (inset ? g : g / 2), z: inset ? z - dt : z, w: dw, h: dh, d: dt },
      door: { hinge, hingeType: htype }, hinges: hp, explode: [0, 0, 2],
      note: `${HINGE_TYPES[htype].name}, ${where}: ${hp.length} × Ø35 cups at ${hp.join(', ')} mm from the ${hinge === 'T' || hinge === 'B' ? 'left' : 'top'} end, centre 22.5 mm in from the edge, ${dt >= 18 ? 13 : 12} mm deep`,
    });
    hw(key, hp.length);
    if (type === 'push') hw('pushLatch', 1); else hw('handle', 1);
    if (flap) hw('flapStay', 1);
    if (s.dropDown) hw('flapStay', 1);
  }
  if (dw > (o.maxDoor || 600) + 1 && !flap && !s.dropDown) out.warnings.push(`Doors${secName} are ${Math.round(dw)} mm wide. Above ~600 mm they sag and swing into the room: use more doors.`);
  if (flap && dw > 1200) out.warnings.push(`Lift-up flap${secName} is ${Math.round(dw)} mm wide: over 1200 mm use two flaps or a bi-fold lift.`);
}

function drawers(o, out, add, hw, { n, xs, secW, zx0, zx1, f0, f1, inner0, inner1, z0, D, secName }) {
  const g = o.gap ?? 3;
  const dt = o.doorT || o.T;
  const thick = o.doorEdge !== 'none';
  const bt = o.drawerT || o.T;
  const inset = o.hingeType === 'inset';
  const G = o.G || GRADES.medium;
  const slideKey = G.slide;
  const sideGap = slideKey === 'slideSoft' ? 5 : 13;
  const slide = Math.max(250, Math.min(600, Math.floor((D - 30 - (inset ? dt : 0)) / 50) * 50));
  if (inset) { f0 = inner0; f1 = inner1; zx0 = xs; zx1 = xs + secW; }
  const fh = (f1 - f0 - g * n - (inset ? g : 0)) / n;
  const innerEach = (inner1 - inner0) / n;
  const boxH = Math.max(70, Math.min(fh - 50, innerEach - 30));
  const boxW = secW - 2 * sideGap; // slide clearance each side
  const fw = zx1 - zx0 - g - (inset ? g : 0); // fronts overlay the sides / half of each divider
  for (let k = 0; k < n; k++) {
    const y = f0 + (inset ? g : g / 2) + k * (fh + g);
    add('Drawer front' + secName, {
      mat: o.doorMat || o.mat, color: o.doorColor || o.color, L: fw, W: fh, eL: thick ? 2 : 0, eW: thick ? 2 : 0, edge: 'thick', role: 'door', grain: true,
      box: { x: zx0 + (inset ? g : g / 2), y, z: inset ? z0 + D - dt : z0 + D, w: fw, h: fh, d: dt }, explode: [0, 0, 2.2], door: { drawer: true },
    });
    const by = Math.max(inner0 + k * innerEach + 15, inner0);
    const bz = z0 + D - slide - (inset ? dt : 0);
    const m = o.drawerMat || o.mat;
    const c = o.drawerColor || o.color;
    add('Drawer side' + secName, { mat: m, color: c, L: slide, W: boxH, eL: 1, role: 'drawer', box: { x: xs + sideGap, y: by, z: bz, w: bt, h: boxH, d: slide }, explode: [0, 0, 1.6] });
    add('Drawer side' + secName, { mat: m, color: c, L: slide, W: boxH, eL: 1, role: 'drawer', box: { x: xs + sideGap + boxW - bt, y: by, z: bz, w: bt, h: boxH, d: slide }, explode: [0, 0, 1.6] });
    add('Drawer front (inner)' + secName, { mat: m, color: c, L: boxW - 2 * bt, W: boxH, eL: 1, role: 'drawer', box: { x: xs + sideGap + bt, y: by, z: bz + slide - bt, w: boxW - 2 * bt, h: boxH, d: bt }, explode: [0, 0, 1.6] });
    add('Drawer back' + secName, { mat: m, color: c, L: boxW - 2 * bt, W: boxH, eL: 1, role: 'drawer', box: { x: xs + sideGap + bt, y: by, z: bz, w: boxW - 2 * bt, h: boxH, d: bt }, explode: [0, 0, 1.6] });
    const bm = o.hdfMat || o.backMat || '@back';
    const bT = matById(o.lib, bm).T;
    add('Drawer bottom' + secName, { mat: bm, color: 'hdf', L: slide, W: boxW, role: 'drawer', grain: false, box: { x: xs + sideGap, y: by - bT, z: bz, w: boxW, h: bT, d: slide }, explode: [0, 0, 1.6] });
    hw(slideKey, 1);
    hw('handle', 1);
    hw('screw', 8);
  }
  out.notes.push(`Drawers${secName}: ${n} × ${slideKey === 'slideSoft' ? 'soft-close undermount slides' : slideKey === 'slideRoller' ? 'roller runners' : 'ball-bearing slides (full extension)'} ${slide} mm; boxes ${Math.round(boxW)} mm wide × ${Math.round(boxH)} mm high (${sideGap} mm slide gap each side).`);
  if (fh < 100) out.warnings.push(`Drawer fronts${secName} are only ${Math.round(fh)} mm high: use fewer drawers.`);
}
