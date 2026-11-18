// Room planner: the room's size, doors, windows, sockets and TV, where each piece of furniture stands,
// automatic arranging, clearance checks, TV advice and headboard socket cut-outs.
// Room coordinates (mm), seen from above: x → along wall A (top of the plan), z ↓ along wall B.
// Walls: A = top (z = 0), B = right (x = L), C = bottom (z = W), D = left (x = 0).
// A position on a wall is measured from its left end on the plan (A and C from the left corner, B and D from the top corner).

export const WALLS = ['A', 'B', 'C', 'D'];
export const WALL_NAMES = { A: 'Wall A (top)', B: 'Wall B (right)', C: 'Wall C (bottom)', D: 'Wall D (left)' };
const ROT = { A: 0, B: 270, C: 180, D: 90 }; // rotation that puts an item's back against each wall

export function defaultRoom() {
  return {
    L: 4000, W: 3600, H: 2700, curve: { wall: 'C', depth: 0 },
    doors: [{ type: 'door', wall: 'C', pos: 600, w: 900, h: 2100, y: 0, swing: 'L' }],
    sockets: [],
    tv: [],
  };
}

export const wallLen = (room, w) => (w === 'A' || w === 'C' ? room.L : room.W);
// a point on a wall (pos along it, d = distance into the room)
export function wallPoint(room, wall, pos, d = 0) {
  if (wall === 'A') return { x: pos, z: d };
  if (wall === 'C') return { x: pos, z: room.W - d };
  if (wall === 'B') return { x: room.L - d, z: pos };
  return { x: d, z: pos };
}

/* ---------------------------------------------------------------- item geometry */
// plan footprint of a built item in its own coordinates
export function footprint(out) {
  if (out.footprint) return out.footprint;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, h = 0;
  const addPt = (x, z) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); };
  const addBox = (b, f) => {
    h = Math.max(h, b.y + b.h);
    const pts = [[b.x, b.z], [b.x + b.w, b.z], [b.x + b.w, b.z + b.d], [b.x, b.z + b.d]];
    for (const [x, z] of pts) { if (f) { const q = frameXZ(f, x, z); addPt(q.x, q.z); } else addPt(x, z); }
  };
  for (const p of out.panels) addBox(p.box, p.frame);
  for (const b of out.bars || []) addBox(b);
  for (const m of out.marks || []) addBox(m);
  if (!isFinite(x0)) return { x0: 0, x1: 1, z0: 0, z1: 1, h: 0 };
  return { x0, x1, z0, z1, h };
}
// a point in a part's own turned frame → the furniture's coordinates
export function frameXZ(f, x, z) {
  const t = ((f.ry || 0) * Math.PI) / 180;
  return { x: f.x + x * Math.cos(t) + z * Math.sin(t), z: f.z - x * Math.sin(t) + z * Math.cos(t) };
}
const rad = (deg) => (deg * Math.PI) / 180;
export function toRoom(place, lx, lz) {
  const t = rad(place.rot || 0);
  const c = Math.round(Math.cos(t) * 1e6) / 1e6;
  const s = Math.round(Math.sin(t) * 1e6) / 1e6;
  return { x: place.x + lx * c + lz * s, z: place.z - lx * s + lz * c };
}
export function toLocal(place, rx, rz) {
  const t = rad(place.rot || 0);
  const c = Math.round(Math.cos(t) * 1e6) / 1e6;
  const s = Math.round(Math.sin(t) * 1e6) / 1e6;
  const dx = rx - place.x;
  const dz = rz - place.z;
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}
export function corners(fp, place) {
  return [[fp.x0, fp.z0], [fp.x1, fp.z0], [fp.x1, fp.z1], [fp.x0, fp.z1]].map(([x, z]) => toRoom(place, x, z));
}
export function aabb(fp, place) {
  const c = corners(fp, place);
  return { x0: Math.min(...c.map((p) => p.x)), x1: Math.max(...c.map((p) => p.x)), z0: Math.min(...c.map((p) => p.z)), z1: Math.max(...c.map((p) => p.z)) };
}
const overlap = (a, b, tol = 2) => a.x0 < b.x1 - tol && a.x1 > b.x0 + tol && a.z0 < b.z1 - tol && a.z1 > b.z0 + tol;
// which wall an item's back is against (or null)
export function backWall(room, fp, place) {
  const r = aabb(fp, place);
  const rot = ((place.rot || 0) % 360 + 360) % 360;
  const wall = Object.keys(ROT).find((w) => ROT[w] === rot);
  const gap = { A: r.z0, C: room.W - r.z1, B: room.L - r.x1, D: r.x0 }[wall];
  return gap !== undefined && gap < 60 ? wall : null;
}

// put an item with its back against a wall, centred at pos along the wall
export function placeAgainst(room, fp, wall, center) {
  const rot = ROT[wall];
  const r = aabb(fp, { x: 0, z: 0, rot });
  const midX = (r.x0 + r.x1) / 2;
  const midZ = (r.z0 + r.z1) / 2;
  if (wall === 'A') return { x: center - midX, z: -r.z0, rot };
  if (wall === 'C') return { x: center - midX, z: room.W - r.z1, rot };
  if (wall === 'B') return { x: room.L - r.x1, z: center - midZ, rot };
  return { x: -r.x0, z: center - midZ, rot };
}
// width of an item along the wall it stands against
export const alongWidth = (fp) => fp.x1 - fp.x0;

/* ---------------------------------------------------------------- obstacles from the room */
function doorZones(room) {
  // the floor a door swings over (square of door width in front of it) plus the opening itself
  return (room.doors || []).filter((d) => d.type === 'door').map((d) => {
    const a = wallPoint(room, d.wall, d.pos, 0);
    const b = wallPoint(room, d.wall, d.pos + d.w, d.w);
    return { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z), door: d };
  });
}
function tvZones(room) {
  return (room.tv || []).map((tv) => {
    const w = (tv.size || 50) * 25.4 * 0.872;
    const a = wallPoint(room, tv.wall, tv.pos - w / 2 - 100, 0);
    const b = wallPoint(room, tv.wall, tv.pos + w / 2 + 100, 120);
    return { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z), sill: (tv.y || 1100) - (tv.size || 50) * 25.4 * 0.245, win: { wall: tv.wall }, tv: true };
  });
}
function windowZones(room) {
  return (room.doors || []).filter((d) => d.type === 'window').map((d) => {
    const a = wallPoint(room, d.wall, d.pos, 0);
    const b = wallPoint(room, d.wall, d.pos + d.w, 120);
    return { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z), sill: d.y || 900, win: d };
  });
}

/* ---------------------------------------------------------------- automatic arranging */
// entries: [{ item, out, fp, kind }]; places those without item.place (or all when force)
// floor that must stay free around an item (walkways, door swing)
function keepClear(model, out) {
  if (model === 'bed') return { front: 600, sides: out && out.bed && out.bed.totalW <= 1100 ? 0 : 450 };
  if (model === 'bunk') return { front: 700, sides: 0 };
  if (model === 'curved') return { front: 500, sides: 0 };
  if (['cupboard', 'combo', 'kitchenTall'].includes(model)) return { front: 800, sides: 0 };
  if (/kitchen/.test(model)) return { front: 1000, sides: 0 };
  return { front: 400, sides: 0 };
}
function zonesFor(fp, place, need) {
  // rectangles in local coordinates, turned into room boxes
  const z = [];
  if (need.front) z.push({ x0: fp.x0, x1: fp.x1, z0: fp.z1, z1: fp.z1 + need.front });
  if (need.sides) {
    z.push({ x0: fp.x0 - need.sides, x1: fp.x0, z0: fp.z0 + 100, z1: fp.z1 });
    z.push({ x0: fp.x1, x1: fp.x1 + need.sides, z0: fp.z0 + 100, z1: fp.z1 });
  }
  return z.map((r) => aabb(r, place));
}
const inside = (room, b) => b.x0 > -2 && b.z0 > -2 && b.x1 < room.L + 2 && b.z1 < room.W + 2;

// entries: [{ item, out, fp }]; places those without item.place (or all when force).
// Tries several positions for the first (biggest) piece and keeps the arrangement with the best walkways.
export function autoArrange(room, entries, force = false) {
  const fixed = entries.filter((x) => x.item.place && !force);
  const doors = doorZones(room);
  const wins = [...windowZones(room), ...tvZones(room)];
  const tvWall = (room.tv || [])[0] && room.tv[0].wall;
  const opposite = { A: 'C', C: 'A', B: 'D', D: 'B' };
  const order = { bed: 0, bunk: 0, curved: 1, combo: 1, cupboard: 1, kitchenRun: 2, kitchenTall: 2, kitchenBase: 3, kitchenWall: 3, nightstand: 4, custom: 5 };
  const todo = entries.filter((e) => force || !e.item.place).sort((a, b) => (order[a.item.model] ?? 5) - (order[b.item.model] ?? 5) || alongWidth(b.fp) - alongWidth(a.fp));
  // every possible spot for one piece, best first
  const candidates = (e, placed, zones) => {
    const need = keepClear(e.item.model, e.out);
    const list = [];
    for (const wall of WALLS) {
      const len = wallLen(room, wall);
      const wdt = alongWidth(e.fp);
      if (wdt > len) continue;
      const curvedWall = room.curve && room.curve.depth > 0 && room.curve.wall === wall;
      if ((e.item.model === 'curved') !== !!curvedWall) continue;
      for (let c = wdt / 2; c <= len - wdt / 2 + 1; c += 50) {
        const place = placeAgainst(room, e.fp, wall, c);
        const box = aabb(e.fp, place);
        if (!inside(room, box)) continue;
        if (placed.some((p) => overlap(box, p))) continue;
        if (doors.some((d) => overlap(box, d))) continue;
        if (wins.some((w) => overlap(box, w) && e.fp.h > w.sill)) continue;
        const myZones = zonesFor(e.fp, place, need);
        const clash = zones.filter((zn) => overlap(box, zn)).length + myZones.filter((zn) => !inside(room, zn) || placed.some((p) => overlap(zn, p))).length;
        let score = clash * 3000;
        const fromEnds = Math.min(c - wdt / 2, len - c - wdt / 2);
        if (e.item.model === 'bed' || e.item.model === 'bunk') {
          score += Math.abs(c - len / 2) * (e.item.model === 'bunk' ? 0 : 1);
          if (e.item.model === 'bunk') score += fromEnds;
          if (doors.some((d) => d.door.wall === wall)) score += 2000;
          if (wins.some((w) => w.win.wall === wall)) score += 600;
          if (tvWall && opposite[wall] === tvWall) score -= 1500;
          if (tvWall === wall) score += 3000;
        } else if (/kitchen/.test(e.item.model)) {
          score += fromEnds - len * 2;
        } else if (e.item.model === 'curved') {
          score += Math.abs(c - len / 2);
        } else {
          score += fromEnds;
          if (tvWall === wall) score += 800;
        }
        list.push({ score, clash, place, box, myZones });
      }
    }
    return list.sort((p, q) => p.score - q.score);
  };
  const run = (firstPick) => {
    const placed = fixed.map((e) => aabb(e.fp, e.item.place));
    const zones = fixed.flatMap((e) => zonesFor(e.fp, e.item.place, keepClear(e.item.model, e.out)));
    const res = [];
    let cost = 0;
    todo.forEach((e, i) => {
      const best = i === 0 && firstPick ? firstPick : candidates(e, placed, zones)[0];
      if (!best) { res.push({ e, ok: false }); cost += 50000; return; }
      placed.push(best.box);
      zones.push(...best.myZones);
      res.push({ e, ok: true, place: best.place, tight: best.clash > 0 });
      cost += best.score;
    });
    return { res, cost };
  };
  let best = run(null);
  if (todo.length > 1) {
    const first = candidates(todo[0], fixed.map((e) => aabb(e.fp, e.item.place)), []);
    // a spread of different spots: the best few on each wall
    const tried = new Set();
    for (const c of first) {
      const key = `${c.place.rot}|${Math.round((c.place.x + c.place.z) / 300)}`;
      if (tried.has(key) || tried.size > 24) continue;
      tried.add(key);
      const r = run(c);
      if (r.cost < best.cost) best = r;
    }
  }
  for (const r of best.res) if (r.ok) r.e.item.place = r.place;
  return best.res.map((r) => ({ item: r.e.item, ok: r.ok, tight: r.tight }));
}

/* ---------------------------------------------------------------- free spans along a wall (for "design for this wall") */
export function freeSpans(room, wall, entries = [], tallOnly = true) {
  const len = wallLen(room, wall);
  const blocks = [];
  for (const d of room.doors || []) if (d.wall === wall && (d.type === 'door' || tallOnly)) blocks.push([d.pos - 50, d.pos + d.w + 50]);
  for (const e of entries) {
    if (!e.item.place) continue;
    const b = aabb(e.fp, e.item.place);
    const touching = { A: b.z0 < 60, C: b.z1 > room.W - 60, B: b.x1 > room.L - 60, D: b.x0 < 60 }[wall];
    if (!touching) continue;
    blocks.push(wall === 'A' || wall === 'C' ? [b.x0, b.x1] : [b.z0, b.z1]);
  }
  // doors on the side walls take space near the corners
  blocks.sort((a, b) => a[0] - b[0]);
  const spans = [];
  let cur = 0;
  for (const [a, b] of blocks) {
    if (a > cur + 1) spans.push([cur, Math.min(a, len)]);
    cur = Math.max(cur, b);
  }
  if (cur < len - 1) spans.push([cur, len]);
  return spans.filter(([a, b]) => b - a >= 300).sort((p, q) => q[1] - q[0] - (p[1] - p[0]));
}

/* ---------------------------------------------------------------- checks and advice */
const fmt = (v) => `${Math.round(v)} mm`;
// distance from a face of the box, in a direction, to the nearest wall or other box
function clearance(room, box, dir, others) {
  let d = dir === 'S' ? room.W - box.z1 : dir === 'N' ? box.z0 : dir === 'E' ? room.L - box.x1 : box.x0;
  for (const o of others) {
    if (dir === 'S' || dir === 'N') {
      if (o.x1 <= box.x0 || o.x0 >= box.x1) continue;
      const g = dir === 'S' ? o.z0 - box.z1 : box.z0 - o.z1;
      if (g >= -1) d = Math.min(d, g);
    } else {
      if (o.z1 <= box.z0 || o.z0 >= box.z1) continue;
      const g = dir === 'E' ? o.x0 - box.x1 : box.x0 - o.x1;
      if (g >= -1) d = Math.min(d, g);
    }
  }
  return Math.max(0, d);
}
const dirOf = (rot, local) => {
  // local direction (front / left / right) → compass direction in the plan
  const order = ['S', 'E', 'N', 'W']; // front for rot 0, 90(ccw)… front of rot 0 = S
  const r = ((rot % 360) + 360) % 360;
  const idx = { 0: 0, 90: 1, 180: 2, 270: 3 }[r] ?? 0;
  const front = order[idx];
  const turn = { front: 0, right: 3, left: 1, back: 2 }[local];
  return order[(order.indexOf(front) + turn) % 4];
};

export function checkRoom(room, entries) {
  const msgs = [];
  const add = (level, text) => msgs.push({ level, text });
  const placed = entries.filter((e) => e.item.place);
  const boxes = placed.map((e) => ({ e, box: aabb(e.fp, e.item.place) }));
  const doors = doorZones(room);
  const wins = windowZones(room);
  if (!placed.length) add('tip', 'Place your furniture: tap “Arrange automatically” or tap an item below.');
  for (const { e, box } of boxes) {
    const nm = e.item.name;
    if (box.x0 < -2 || box.z0 < -2 || box.x1 > room.L + 2 || box.z1 > room.W + 2) add('warn', `${nm} goes outside the room.`);
    for (const d of doors) if (overlap(box, d)) add('warn', `${nm} is in the way of the door on ${WALL_NAMES[d.door.wall]}.`);
    for (const w of wins) if (overlap(box, w) && e.fp.h > w.sill + 20) add('warn', `${nm} (${fmt(e.fp.h)} high) covers the window on ${WALL_NAMES[w.win.wall]} (sill ${fmt(w.sill)}).`);
    for (const w of tvZones(room)) if (overlap(box, w) && e.fp.h > w.sill) add('warn', `${nm} is in front of the TV on ${WALL_NAMES[w.win.wall]}.`);
    if (e.fp.h > room.H - 30) add('warn', `${nm} is ${fmt(e.fp.h)} tall: too tall for the ${fmt(room.H)} ceiling (it can’t be stood up).`);
  }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (overlap(boxes[i].box, boxes[j].box)) add('warn', `${boxes[i].e.item.name} and ${boxes[j].e.item.name} overlap.`);
  // walkways
  for (const { e, box } of boxes) {
    const others = boxes.filter((b) => b.e !== e).map((b) => b.box);
    const rot = e.item.place.rot || 0;
    const front = clearance(room, box, dirOf(rot, 'front'), others);
    if (e.item.model === 'bed') {
      const toWall = { N: 'A', E: 'B', S: 'C', W: 'D' };
      for (const sd of ['left', 'right']) {
        const dir = dirOf(rot, sd);
        const v = clearance(room, box, dir, others);
        const side = `the ${WALL_NAMES[toWall[dir]].replace(/ \(.*/, '')} side`;
        if (v < 450) add(v < 50 && e.out.bed && e.out.bed.totalW <= 1100 ? 'tip' : 'warn', v < 50 ? `No walkway beside ${e.item.name} on ${side}${e.out.bed && e.out.bed.totalW <= 1100 ? ': fine for a single bed against a wall' : ': a double bed needs 450–600 mm on both sides to make it'}.` : `Only ${fmt(v)} beside ${e.item.name} on ${side}: 600 mm is comfortable, 450 mm the minimum.`);
        else add('ok', `${fmt(v)} walkway beside ${e.item.name} on ${side}.`);
      }
      if (front < 600) add('warn', `Only ${fmt(front)} at the foot of ${e.item.name}: keep 600 mm or more.`);
    } else if (e.item.model === 'cupboard' && e.item.params.style === 'open') {
      if (front < 450) add('warn', `Only ${fmt(front)} in front of ${e.item.name}: leave 450 mm or more to reach the shelves.`);
    } else if (['cupboard', 'combo', 'kitchenTall'].includes(e.item.model)) {
      if (front < 750) add('warn', `Only ${fmt(front)} in front of ${e.item.name}: doors need about 600 mm to open plus room to stand (750–900 mm).`);
      else add('ok', `${fmt(front)} free in front of ${e.item.name}.`);
    } else if (/kitchen/.test(e.item.model)) {
      if (front < 1000) add('warn', `Only ${fmt(front)} in front of ${e.item.name}: 1000–1200 mm lets you open the oven and drawers and pass behind the cook.`);
    }
  }
  // sockets
  for (const s of room.sockets || []) {
    const pt = wallPoint(room, s.wall, s.pos, 5);
    const label = `${s.type === 'switch' ? 'Switch' : 'Socket'} at ${fmt(s.pos)} on ${WALL_NAMES[s.wall]} (${fmt(s.y)} high)`;
    for (const { e, box } of boxes) {
      if (pt.x < box.x0 || pt.x > box.x1 || pt.z < box.z0 || pt.z > box.z1) continue;
      const loc = toLocal(e.item.place, pt.x, pt.z);
      if (e.item.model === 'bed' && e.out.bed) {
        const hb = e.out.headboards || [];
        const onHb = hb.some((h) => loc.x >= h.left && loc.x <= h.right) && s.y < (e.out.bed.headH || 0) - 40;
        if (onHb) { add('ok', `${label} comes through the headboard: the cut-out is added to the bed’s cut list.`); continue; }
        if (s.y < e.out.bed.nsH + 60) { add('warn', `${label} is hidden behind a nightstand: move it to about ${fmt(e.out.bed.nsH + 150)} high.`); continue; }
        if (s.y < e.out.bed.mattressTop) add('warn', `${label} is behind the bed, below the mattress: move it beside the bed.`);
        continue;
      }
      if (s.y < e.fp.h) add('warn', `${label} is behind ${e.item.name}: move it beside it, or cut a hole in its back.`);
    }
  }
  // suggested sockets beside beds, and TV advice
  const tv = (room.tv || [])[0];
  for (const { e } of boxes) {
    if (e.item.model !== 'bed' || !e.out.bed) continue;
    const b = e.out.bed;
    const wall = backWall(room, e.fp, e.item.place);
    if (wall) {
      const sides = [];
      if (b.nsLeft) sides.push(-b.nsGap - b.nsW / 2);
      if (b.nsRight) sides.push(b.totalW + b.nsGap + b.nsW / 2);
      if (!sides.length) sides.push(-250, b.totalW + 250);
      for (const lx of sides) {
        const p = toRoom(e.item.place, lx, 0);
        const pos = wall === 'A' || wall === 'C' ? p.x : p.z;
        const has = (room.sockets || []).some((s) => s.wall === wall && Math.abs(s.pos - pos) < 400 && s.type !== 'switch');
        if (!has) add('tip', `Add a double socket on ${WALL_NAMES[wall]} at ${fmt(pos)}, ${fmt((b.nsH || 500) + 150)} high (beside ${e.item.name}).`);
      }
    }
    if (tv) {
      const tp = wallPoint(room, tv.wall, tv.pos, 0);
      const pillow = toRoom(e.item.place, b.totalW / 2, 450);
      const footDir = toRoom({ ...e.item.place, x: 0, z: 0 }, 0, 1);
      const vx = tp.x - pillow.x;
      const vz = tp.z - pillow.z;
      const along = vx * footDir.x + vz * footDir.z;
      const side = Math.abs(-vx * footDir.z + vz * footDir.x);
      if (along <= 0) add('warn', `The TV on ${WALL_NAMES[tv.wall]} is behind or beside ${e.item.name}: put it on the wall the bed faces.`);
      else {
        const dist = Math.hypot(vx, vz);
        const sizes = [32, 40, 43, 50, 55, 65, 75, 85];
        const minIn = dist / 25.4 / 2.5;
        const maxIn = dist / 25.4 / 1.5;
        const fit = sizes.filter((s) => s >= minIn * 0.9 && s <= maxIn);
        add('ok', `TV viewing distance from the pillow: ${(dist / 1000).toFixed(1)} m. Good screen sizes: ${fit.length ? fit.join('″, ') + '″' : Math.round(minIn) + '″'} (1.5–2.5 × the screen diagonal).${tv.size && fit.length && (tv.size < fit[0] || tv.size > fit[fit.length - 1]) ? ` Your ${tv.size}″ is ${tv.size < fit[0] ? 'small' : 'big'} for this distance.` : ''}`);
        const eye = (b.mattressTop || 450) + 450;
        const centre = tv.y || 1100;
        if (centre > eye + 450) add('warn', `TV centre ${fmt(centre)} is high for watching from bed (eyes about ${fmt(eye)} when sitting up). Mount it lower, about ${fmt(eye + 200)}, or tilt it down 10–15°.`);
        else add('ok', `TV centre at ${fmt(centre)}: comfortable from bed (eyes about ${fmt(eye)}).`);
        if (side > 400) add('tip', `The TV is ${fmt(side)} off the bed’s centre line: centre it at ${fmt(tv.wall === 'A' || tv.wall === 'C' ? pillow.x : pillow.z)} on ${WALL_NAMES[tv.wall]}.`);
      }
    }
  }
  const area = (room.L * room.W) / 1e6;
  const used = boxes.reduce((a, { box }) => a + ((box.x1 - box.x0) * (box.z1 - box.z0)) / 1e6, 0);
  if (placed.length) add('ok', `Room ${area.toFixed(1)} m², furniture covers ${used.toFixed(1)} m² (${Math.round((used / area) * 100)}%). Under 45% feels open.`);
  return msgs;
}

/* ---------------------------------------------------------------- headboard cut-outs from wall sockets */
export function syncCutouts(room, entries) {
  let changed = false;
  for (const e of entries) {
    if (e.item.model !== 'bed' || !e.item.place || !e.out.bed) continue;
    const wall = backWall(room, e.fp, e.item.place);
    const keep = (e.item.params.cutouts || []).filter((c) => !c.auto);
    const auto = [];
    const hb = e.out.headboards || [];
    if (wall && hb.length) {
      const left = Math.min(...hb.map((h) => h.left));
      for (const s of room.sockets || []) {
        if (s.wall !== wall) continue;
        const pt = wallPoint(room, s.wall, s.pos, 5);
        const loc = toLocal(e.item.place, pt.x, pt.z);
        if (hb.some((h) => loc.x >= h.left + 40 && loc.x <= h.right - 40) && s.y < e.out.bed.headH - 60) {
          auto.push({ kind: s.type === 'switch' ? 'switch' : s.type === 'usb' ? 'usb' : 'socket2', x: Math.round(loc.x - left), y: s.y, auto: true });
        }
      }
    }
    const before = JSON.stringify((e.item.params.cutouts || []).filter((c) => c.auto));
    if (before !== JSON.stringify(auto)) { e.item.params.cutouts = [...keep, ...auto]; changed = true; }
  }
  return changed;
}

/* ---------------------------------------------------------------- the room as 3D parts (floor, see-through walls, openings) */
export function roomOut(room) {
  const out = { panels: [], marks: [], bars: [], legs: [], rails: [] };
  const t = 100;
  const P = (name, role, color, box) => out.panels.push({ id: name, name, role, color, mat: '', L: 0, W: 0, box });
  P('Floor', 'floor', '#d8cbb3', { x: 0, y: -10, z: 0, w: room.L, h: 10, d: room.W });
  P('Wall A', 'wall', '#efe9df', { x: -t, y: 0, z: -t, w: room.L + 2 * t, h: room.H, d: t });
  P('Wall D', 'wall', '#efe9df', { x: -t, y: 0, z: 0, w: t, h: room.H, d: room.W });
  P('Wall B', 'wall', '#efe9df', { x: room.L, y: 0, z: 0, w: t, h: room.H, d: room.W });
  P('Wall C', 'wall', '#efe9df', { x: -t, y: 0, z: room.W, w: room.L + 2 * t, h: room.H, d: t });
  const cv = room.curve;
  if (cv && cv.depth > 0) {
    // replace the straight wall with short wall pieces along the curve, and add the floor of the bay
    const idx = out.panels.findIndex((x) => x.name === `Wall ${cv.wall}`);
    if (idx >= 0) out.panels.splice(idx, 1);
    const c = wallLen(room, cv.wall);
    const s = Math.min(cv.depth, c / 2);
    const R = (c * c / 4 + s * s) / (2 * s);
    const th = 2 * Math.asin(Math.min(1, c / (2 * R)));
    const n = 16;
    const pts = [];
    for (let k = 0; k <= n; k++) { const a = -th / 2 + (k * th) / n; pts.push([c / 2 + R * Math.sin(a), (R - s) - R * Math.cos(a)]); }
    // local curve coordinates: x along the wall, z negative = outside the room → room coordinates
    const toRoomXZ = ([u, v]) => { const q = wallPoint(room, cv.wall, u, v); return [q.x, q.z]; }; // v < 0 = outside the room
    const rp = pts.map(toRoomXZ);
    out.panels.push({ id: 'bay', name: 'Floor (curve)', role: 'floor', color: '#d8cbb3', mat: '', L: 0, W: 0, box: { x: 0, y: -10, z: 0, w: 1, h: 10, d: 1 }, shape: { pts: rp } });
    for (let k = 0; k < n; k++) {
      const [x1, z1] = rp[k];
      const [x2, z2] = rp[k + 1];
      const len = Math.hypot(x2 - x1, z2 - z1);
      const ry = (Math.atan2(-(z2 - z1), x2 - x1) * 180) / Math.PI;
      out.panels.push({ id: 'cw' + k, name: 'Curved wall', role: 'wall', color: '#efe9df', mat: '', L: 0, W: 0, box: { x: 0, y: 0, z: -25, w: len + 4, h: room.H, d: 50 }, frame: { x: x1, z: z1, ry } });
    }
  }
  const onWall = (wall, pos, w, y, h, depth, color, extra = {}) => {
    const a = wallPoint(room, wall, pos, 0);
    const b = wallPoint(room, wall, pos + w, depth);
    out.marks.push({ x: Math.min(a.x, b.x), y, z: Math.min(a.z, b.z), w: Math.max(4, Math.abs(b.x - a.x)), h, d: Math.max(4, Math.abs(b.z - a.z)), color, ...extra });
  };
  for (const d of room.doors || []) {
    if (d.type === 'door') onWall(d.wall, d.pos, d.w, 0, d.h || 2100, 12, '#7a5233');
    else onWall(d.wall, d.pos, d.w, d.y || 900, d.h || 1200, 12, '#a5d0ec', { opacity: 0.6 });
  }
  for (const s of room.sockets || []) onWall(s.wall, s.pos - 43, 86, (s.y || 300) - 43, 86, 10, s.type === 'switch' ? '#e5e7eb' : '#ffffff');
  for (const tv of room.tv || []) {
    const diag = (tv.size || 50) * 25.4;
    const w = diag * 0.872;
    const h = diag * 0.49;
    onWall(tv.wall, tv.pos - w / 2, w, (tv.y || 1100) - h / 2, h, 45, '#111111');
  }
  return out;
}
