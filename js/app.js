// Anatsi — furniture designer + cutting list for carpenters. No ads, no paywall, works offline.
import { $, el, toast, sheet, confirmBox, downloadBlob, storage, uid } from './util.js';
import { loadLibrary, saveLibrary, FINISHES, finishById, fmtLen, toMM, fromMM, matById, DEFAULT_MATERIALS, ROLE_MATS, ROLE_NAMES, priceOf, HINGE_TYPES, hingeGuide, GRADES } from './core.js';
import { defaultRoom, WALLS, WALL_NAMES, footprint, aabb, corners, placeAgainst, autoArrange, checkRoom, syncCutouts, roomOut, freeSpans, wallLen, wallPoint, backWall } from './room.js';
import { MODELS, defaults, buildItem } from './models.js';
import { buildProject, cutList, edgeBanding, hardware, layoutSheets, costs } from './cut.js';
import { sheetSVG, ROLE_COLORS } from './diagram.js';

// replaceChildren that skips empty (null/false) entries and flattens arrays
const _rc = Element.prototype.replaceChildren;
Element.prototype.replaceChildren = function (...kids) { return _rc.apply(this, kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false)); };

let lib = loadLibrary();
let projects = storage.get('anatsi.projects', []);
const saveProjects = () => storage.set('anatsi.projects', projects);
const saveLib = () => saveLibrary({ materials: lib.materials, edges: lib.edges, hardware: lib.hardware, settings: lib.settings, roles: lib.roles });
const region = () => lib.settings.region || 'et';
const inRegion = (m) => !m.region || m.region === 'all' || m.region === region();
const U = () => lib.settings.units;
const L = (mm, unit = true) => fmtLen(mm, U(), unit);
const money = (v) => `${Math.round(v).toLocaleString()} ${lib.settings.currency}`;

/* ================================================================ 3D (loaded only when needed) */
let ViewerClass = null;
async function makeViewer(container, opts) {
  try {
    if (!ViewerClass) ViewerClass = (await import('./view3d.js')).Viewer;
    return new ViewerClass(container, opts);
  } catch {
    container.replaceChildren(el('p', { class: 'empty', style: { margin: '20px' } }, 'The 3D view needs an internet connection the first time.'));
    return null;
  }
}

/* ================================================================ navigation */
const screens = { projects: $('#screen-projects'), materials: $('#screen-materials'), settings: $('#screen-settings') };
let tab = 'projects';
function showTab(name) {
  tab = name;
  for (const [k, s] of Object.entries(screens)) s.hidden = k !== name;
  document.querySelectorAll('#tabs button').forEach((b) => (b.dataset.tab === name ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  if (name === 'projects') renderProjects();
  if (name === 'materials') renderMaterials();
  if (name === 'settings') renderSettings();
  window.scrollTo(0, 0);
}
document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

const layers = [];
function pushLayer(close) {
  layers.push(close);
  document.body.classList.add('layer-open');
  history.pushState({ n: layers.length }, '');
}
const popLayer = () => history.back();
window.addEventListener('popstate', () => {
  if (!$('#sheet').hidden) { $('#sheet .sheet-backdrop')?.click(); history.pushState({ n: layers.length }, ''); return; }
  const close = layers.pop();
  if (close) close();
  if (!layers.length) { document.body.classList.remove('layer-open'); if (tab === 'projects') renderProjects(); }
});

/* ================================================================ projects */
function newProject(name = 'New project') {
  const p = { id: uid(), name, client: '', created: Date.now(), updated: Date.now(), items: [], cutMode: lib.settings.cutMode };
  projects.unshift(p);
  saveProjects();
  return p;
}
function newItem(model, extra = {}) {
  const m = MODELS[model];
  return { id: uid(), model, name: extra.name || m.name, qty: extra.qty || 1, params: { ...defaults(m), ...(extra.params || {}) } };
}

const QUICK = [
  { label: 'Kitchen from my wall', icon: '🍳', sub: 'Enter the wall length', make: () => [newItem('kitchenRun', { name: 'Kitchen' })] },
  { label: 'Plan a room', icon: '📐', sub: 'Room size, sockets, TV → furniture fitted', tab: 'room', room: true, make: () => [newItem('bed', { name: 'Queen bed', params: MODELS.bed.presets['Hotel queen (1600×2000)'] }), newItem('combo', { name: 'Wardrobe + desk', params: MODELS.combo.presets['Small room 1.8 m (fold-down desk)'] })] },
  { label: 'Hotel room set', icon: '🏨', sub: 'Queen bed, nightstands, wardrobe', make: () => [newItem('bed', { name: 'Queen bed', params: MODELS.bed.presets['Hotel queen (1600×2000)'] }), newItem('cupboard', { name: 'Wardrobe', params: MODELS.cupboard.presets['Hotel wardrobe 900'] })] },
  { label: 'Joinable twin beds', icon: '🛏️', sub: '2 twins that make a king', make: () => [newItem('bed', { name: 'Twin beds', params: MODELS.bed.presets['Joinable twins → king (2× 900×2000)'] })] },
  { label: 'Wardrobe', icon: '🚪', sub: 'Doors, shelves, rail', make: () => [newItem('cupboard', { name: 'Wardrobe', params: MODELS.cupboard.presets['Wardrobe 3-door 1500'] })] },
  { label: 'Bookcase / cupboard', icon: '📚', sub: 'Open or closed', make: () => [newItem('cupboard', { name: 'Bookcase', params: MODELS.cupboard.presets['Bookcase open'] })] },
  { label: 'Cutting list only', icon: '✂️', sub: 'Type in your parts', make: () => [newItem('custom', { name: 'My parts' })] },
];

function renderProjects() {
  $('#quick').replaceChildren(...QUICK.map((q) => el('button', { class: 'quick', type: 'button', onclick: () => {
    const p = newProject(q.label);
    p.items.push(...q.make());
    if (q.room) p.room = defaultRoom();
    saveProjects();
    openProject(p, q.tab || 'items');
    if (p.items.length === 1 && !q.tab) setTimeout(() => openItem(p, p.items[0]), 60);
  } }, el('span', {}, q.icon), el('b', {}, q.label), el('small', {}, q.sub))));
  const list = $('#project-list');
  if (!projects.length) {
    list.replaceChildren(el('p', { class: 'empty' }, 'No projects yet. Pick one above, or tap “+ New project”.'));
    return;
  }
  list.replaceChildren(...projects.map((p) => el('div', { class: 'card' },
    el('div', { class: 'row-between' },
      el('button', { class: 'card click', style: { border: 0, padding: 0 }, type: 'button', onclick: () => openProject(p) },
        el('h3', {}, p.name),
        el('div', { class: 'sub' }, `${p.items.length} item${p.items.length === 1 ? '' : 's'}${p.client ? ' · ' + p.client : ''} · ${new Date(p.updated).toLocaleDateString()}`),
        el('div', { class: 'sub' }, p.items.map((i) => `${i.qty > 1 ? i.qty + '× ' : ''}${i.name}`).join(', '))),
      el('button', { class: 'icon-btn ghost', type: 'button', 'aria-label': 'More', onclick: () => projectMenu(p) }, '⋯')))));
}
$('#new-project').addEventListener('click', async () => {
  const name = await ask('New project', 'e.g. Hotel rooms 2nd floor');
  if (!name) return;
  openProject(newProject(name));
});

function projectMenu(p) {
  const close = sheet(p.name, el('div', { class: 'menu' },
    el('button', { type: 'button', onclick: () => { close(); openProject(p); } }, el('span', { class: 'i' }, '📂'), 'Open'),
    el('button', { type: 'button', onclick: async () => { close(); const n = await ask('Rename project', '', p.name); if (n) { p.name = n; saveProjects(); renderProjects(); } } }, el('span', { class: 'i' }, '✎'), 'Rename'),
    el('button', { type: 'button', onclick: () => { close(); const c = structuredClone(p); c.id = uid(); c.name += ' (copy)'; c.items.forEach((i) => { i.id = uid(); }); projects.unshift(c); saveProjects(); renderProjects(); } }, el('span', { class: 'i' }, '⧉'), 'Duplicate'),
    el('button', { type: 'button', class: 'danger', onclick: async () => { close(); if (await confirmBox(`Delete the project “${p.name}”?`, 'Delete')) { projects = projects.filter((x) => x.id !== p.id); saveProjects(); renderProjects(); } } }, el('span', { class: 'i' }, '🗑'), 'Delete')));
}

function ask(title, placeholder = '', value = '') {
  return new Promise((resolve) => {
    const input = el('input', { value, placeholder, maxlength: 80 });
    const done = (v) => { close(); resolve(v); };
    const close = sheet(title, el('form', { onsubmit: (e) => { e.preventDefault(); done(input.value.trim()); } },
      el('label', { class: 'field-block' }, input),
      el('div', { class: 'row end' }, el('button', { class: 'btn', type: 'button', onclick: () => done('') }, 'Cancel'), el('button', { class: 'btn primary', type: 'submit' }, 'Save'))), { onClose: () => resolve('') });
    setTimeout(() => input.focus(), 60);
  });
}

/* ================================================================ project screen */
function openProject(p, startTab = 'items') {
  const host = $('#layer-project');
  let current = 'items';
  let viewer = null;
  const nameBtn = el('button', { class: 'name', type: 'button' }, p.name);
  nameBtn.addEventListener('click', async () => { const n = await ask('Rename project', '', p.name); if (n) { p.name = n; nameBtn.textContent = n; touch(); } });
  const tabsBar = el('div', { class: 'layer-tabs', role: 'tablist' });
  const body = el('div', { class: 'layer-body' });
  const TABS = [['items', 'Furniture'], ['room', 'Room'], ['3d', '3D'], ['cut', 'Cut list'], ['sheets', 'Sheets'], ['cost', 'Cost']];
  const touch = () => { p.updated = Date.now(); saveProjects(); };

  const show = (t) => {
    current = t;
    tabsBar.querySelectorAll('button').forEach((b) => (b.dataset.t === t ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
    if (viewer) { viewer.destroy(); viewer = null; }
    body.scrollTop = 0;
    ({ items: renderItems, room: renderRoom, '3d': render3D, cut: renderCut, sheets: renderSheets, cost: renderCost })[t]();
  };
  tabsBar.replaceChildren(...TABS.map(([k, label]) => el('button', { type: 'button', 'data-t': k, onclick: () => show(k) }, label)));

  function renderItems() {
    const add = el('button', { class: 'btn primary wide', type: 'button', onclick: () => addItemPanel() }, '+ Add furniture');
    const cards = p.items.map((it) => {
      const m = MODELS[it.model];
      let size = '';
      try { const o = buildItem(it, lib); size = `${L(o.size.w, false)} × ${L(o.size.h, false)} × ${L(o.size.d)} · ${o.panels.length} parts`; } catch { size = 'Needs checking'; }
      const qty = el('span', {}, String(it.qty));
      return el('div', { class: 'card item-card' },
        el('button', { class: 'thumb', type: 'button', style: { border: 0, backgroundImage: it.thumb ? `url(${it.thumb})` : '' }, 'aria-label': 'Edit', onclick: () => openItem(p, it) }, it.thumb ? '' : m.icon),
        el('div', { class: 'grow' },
          el('div', { class: 'row-between' }, el('h3', {}, it.name), el('button', { class: 'icon-btn ghost', type: 'button', 'aria-label': 'More', onclick: () => itemMenu(it) }, '⋯')),
          el('div', { class: 'sub' }, m.name),
          el('div', { class: 'sub' }, size),
          el('div', { class: 'row', style: { marginTop: '6px' } },
            el('div', { class: 'qty' },
              el('button', { type: 'button', 'aria-label': 'Fewer', onclick: () => { it.qty = Math.max(1, it.qty - 1); qty.textContent = it.qty; touch(); } }, '−'), qty,
              el('button', { type: 'button', 'aria-label': 'More', onclick: () => { it.qty = Math.min(999, it.qty + 1); qty.textContent = it.qty; touch(); } }, '+')),
            el('button', { class: 'btn small', type: 'button', onclick: () => openItem(p, it) }, 'Edit design'))));
    });
    body.replaceChildren(el('div', { class: 'pad' },
      el('label', { class: 'field-block' }, 'Client / location', el('input', { value: p.client || '', placeholder: 'Optional', oninput: (e) => { p.client = e.target.value; touch(); } })),
      cards.length ? el('div', { class: 'cards' }, cards) : el('p', { class: 'empty' }, 'Add kitchens, beds, wardrobes or your own parts. Each one gets its own 3D model and cut list.'),
      el('div', { style: { marginTop: '14px' } }, add)));
  }

  function itemMenu(it) {
    const close = sheet(it.name, el('div', { class: 'menu' },
      el('button', { type: 'button', onclick: () => { close(); openItem(p, it); } }, el('span', { class: 'i' }, '✎'), 'Edit design'),
      el('button', { type: 'button', onclick: async () => { close(); const n = await ask('Rename', '', it.name); if (n) { it.name = n; touch(); renderItems(); } } }, el('span', { class: 'i' }, 'Aa'), 'Rename'),
      el('button', { type: 'button', onclick: () => { close(); const c = structuredClone(it); c.id = uid(); c.name += ' (copy)'; p.items.push(c); touch(); renderItems(); } }, el('span', { class: 'i' }, '⧉'), 'Duplicate'),
      el('button', { type: 'button', class: 'danger', onclick: async () => { close(); if (await confirmBox(`Remove “${it.name}” from this project?`, 'Remove')) { p.items = p.items.filter((x) => x !== it); touch(); renderItems(); } } }, el('span', { class: 'i' }, '🗑'), 'Remove')));
  }

  function addItemPanel() {
    const groups = {};
    for (const [id, m] of Object.entries(MODELS)) (groups[m.group] = groups[m.group] || []).push([id, m]);
    const close = sheet('Add furniture', Object.entries(groups).map(([g, list]) => [
      el('h3', { class: 'section-title', style: { margin: '12px 0 4px' } }, g),
      el('div', { class: 'menu' }, list.map(([id, m]) => el('button', { type: 'button', onclick: () => {
        close();
        const it = newItem(id);
        p.items.push(it);
        touch();
        renderItems();
        openItem(p, it);
      } }, el('span', { class: 'i' }, m.icon), el('span', {}, m.name, el('small', {}, m.desc))))),
    ]));
  }

  async function render3D() {
    const inRoom = p.room && p.items.some((i) => i.place) && p.view3d !== 'items';
    const box = el('div', { class: 'view3d', style: { height: 'calc(100dvh - 170px)' } });
    const info = el('div', { class: 'pick-info', hidden: true });
    const tools = viewTools(() => viewer);
    box.append(info, tools);
    const seg = p.room && p.items.some((i) => i.place) ? el('div', { class: 'seg', style: { margin: '8px' } },
      el('button', { type: 'button', 'aria-pressed': String(inRoom), onclick: () => { p.view3d = 'room'; touch(); show('3d'); } }, 'In the room'),
      el('button', { type: 'button', 'aria-pressed': String(!inRoom), onclick: () => { p.view3d = 'items'; touch(); show('3d'); } }, 'Side by side')) : null;
    body.replaceChildren(seg, box);
    viewer = await makeViewer(box, { onPick: (pn) => showPick(info, pn) });
    if (!viewer) return;
    const groups = [];
    if (inRoom) {
      groups.push({ out: roomOut(p.room) });
      for (const it of p.items) {
        if (!it.place) continue;
        try { groups.push({ out: buildItem(it, lib), offset: [it.place.x, 0, it.place.z], rot: it.place.rot || 0 }); } catch { /* skip */ }
      }
    } else {
      let cursor = 0;
      for (const it of p.items) {
        try {
          const out = buildItem(it, lib);
          const ox = cursor - (out.offsetX || 0);
          groups.push({ out, offset: [ox, 0, 0] });
          cursor += out.size.w + 700;
        } catch { /* skip broken item */ }
      }
    }
    viewer.setModel(groups);
  }


  /* ------------------------------------------------------------ ROOM: plan, placement, checks */
  function entriesOf() {
    return p.items.map((item) => { try { const out = buildItem(item, lib); return { item, out, fp: footprint(out) }; } catch { return null; } }).filter(Boolean);
  }
  let selId = null;
  function renderRoom() {
    if (!p.room) {
      body.replaceChildren(el('div', { class: 'pad' },
        el('p', {}, 'Enter the room’s size, its doors, windows, sockets and TV. The app places your furniture, checks the walkways, puts socket holes in the headboard and tells you the right TV size.'),
        el('button', { class: 'btn primary wide', type: 'button', onclick: () => { p.room = defaultRoom(); touch(); renderRoom(); } }, '+ Add the room')));
      return;
    }
    const room = p.room;
    let entries = entriesOf();
    if (syncCutouts(room, entries)) { touch(); entries = entriesOf(); }
    const planBox = el('div', { class: 'plan-box' });
    const tools = el('div', { class: 'plan-tools' });
    const checks = el('div', {});
    const unplaced = el('div', {});
    const refresh = () => {
      entries = entriesOf();
      if (syncCutouts(room, entries)) entries = entriesOf();
      touch();
      planBox.replaceChildren(planSVG(room, entries));
      drawTools();
      drawChecks();
    };
    function drawChecks() {
      const msgs = checkRoom(room, entries);
      const icon = { warn: '⚠', ok: '✓', tip: '💡' };
      checks.replaceChildren(el('h2', { class: 'section-title' }, 'Room check'), el('ul', { class: 'checks' }, msgs.map((m) => el('li', { class: m.level }, el('span', {}, icon[m.level]), m.text))));
      const free = entries.filter((e) => !e.item.place);
      unplaced.replaceChildren(free.length ? [el('h2', { class: 'section-title' }, 'Not in the room yet'), el('div', { class: 'chips' }, free.map((e) => el('button', { type: 'button', onclick: () => { autoArrange(room, [e, ...entries.filter((x) => x.item.place)]); selId = e.item.id; refresh(); } }, `+ ${e.item.name}`)))] : null);
    }
    function drawTools() {
      const e = entries.find((x) => x.item.id === selId && x.item.place);
      if (!e) {
        tools.replaceChildren(el('div', { class: 'row' },
          el('button', { class: 'btn primary', type: 'button', onclick: () => { const r = autoArrange(room, entries, true); refresh(); const bad = r.filter((x) => !x.ok).length; toast(bad ? `${bad} item${bad > 1 ? 's' : ''} didn’t fit` : r.some((x) => x.tight) ? 'Arranged, but the room is tight: see the checks' : 'Arranged'); } }, '✨ Arrange automatically'),
          el('button', { class: 'btn', type: 'button', onclick: () => room3D() }, '🧊 See it in 3D'),
          el('button', { class: 'btn', type: 'button', onclick: () => designForWall() }, '📏 Design for a wall')),
        el('p', { class: 'muted tiny' }, 'Tap a piece of furniture to move it. Drag it, or use the buttons.'));
        return;
      }
      const it = e.item;
      const move = (dx, dz) => { it.place.x += dx; it.place.z += dz; refresh(); };
      const wall = backWall(room, e.fp, it.place);
      const box = aabb(e.fp, it.place);
      const pos = wall ? (wall === 'A' || wall === 'C' ? box.x0 : box.z0) : null;
      tools.replaceChildren(
        el('div', { class: 'row-between' }, el('b', {}, it.name), el('button', { class: 'btn small', type: 'button', onclick: () => { selId = null; refresh(); } }, 'Done')),
        el('p', { class: 'muted tiny' }, wall ? `Against ${WALL_NAMES[wall]}, ${L(pos)} from its ${wall === 'A' || wall === 'C' ? 'left' : 'top'} corner.` : `Free standing at ${L(box.x0)}, ${L(box.z0)}.`),
        el('div', { class: 'row' }, el('span', { class: 'muted tiny' }, 'Back against:'), WALLS.map((w) => el('button', { class: 'btn small' + (wall === w ? ' primary' : ''), type: 'button', onclick: () => { const c = wall === w && pos !== null ? null : wallLen(room, w) / 2; it.place = placeAgainst(room, e.fp, w, c ?? wallLen(room, w) / 2); refresh(); } }, w))),
        el('div', { class: 'row' },
          el('button', { class: 'btn small', type: 'button', 'aria-label': 'Left', onclick: () => move(-50, 0) }, '◀'),
          el('button', { class: 'btn small', type: 'button', 'aria-label': 'Right', onclick: () => move(50, 0) }, '▶'),
          el('button', { class: 'btn small', type: 'button', 'aria-label': 'Up', onclick: () => move(0, -50) }, '▲'),
          el('button', { class: 'btn small', type: 'button', 'aria-label': 'Down', onclick: () => move(0, 50) }, '▼'),
          wall ? el('button', { class: 'btn small', type: 'button', onclick: () => { it.place = placeAgainst(room, e.fp, wall, wallLen(room, wall) / 2); refresh(); } }, 'Centre') : null,
          el('button', { class: 'btn small', type: 'button', onclick: () => { it.place.rot = ((it.place.rot || 0) + 90) % 360; refresh(); } }, '⟳ Turn'),
          el('button', { class: 'btn small', type: 'button', onclick: () => { delete it.place; selId = null; refresh(); } }, 'Take out'),
          el('button', { class: 'btn small', type: 'button', onclick: () => openItem(p, it) }, 'Edit design')),
        el('p', { class: 'muted tiny' }, 'Arrows move 50 mm.'));
    }
    function planSVG(room, entries) {
      const NS = 'http://www.w3.org/2000/svg';
      const S = (tag, attrs = {}, ...kids) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); n.append(...kids.flat().filter((k) => k != null)); return n; };
      const m = 450;
      const svg = S('svg', { viewBox: `${-m} ${-m} ${room.L + 2 * m} ${room.W + 2 * m}`, class: 'plan', role: 'img', 'aria-label': 'Room plan' });
      svg.append(S('rect', { x: -100, y: -100, width: room.L + 200, height: room.W + 200, fill: '#57534e' }), S('rect', { x: 0, y: 0, width: room.L, height: room.W, fill: '#f6f0e6' }));
      const txt = (x, y, t, size = 150, attrs = {}) => S('text', { x, y, 'font-size': size, 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: '#44403c', ...attrs }, t);
      svg.append(txt(room.L / 2, -270, `A · ${L(room.L)}`, 150, { 'font-weight': 700 }), txt(room.L / 2, room.W + 270, 'C', 150, { 'font-weight': 700 }),
        txt(room.L + 270, room.W / 2, `B · ${L(room.W)}`, 130, { 'font-weight': 700, transform: `rotate(90 ${room.L + 270} ${room.W / 2})` }), txt(-270, room.W / 2, 'D', 150, { 'font-weight': 700 }));
      const seg = (wall, pos, w, d0, d1) => { const a = wallPoint(room, wall, pos, d0); const b = wallPoint(room, wall, pos + w, d1); return { x: Math.min(a.x, b.x), y: Math.min(a.z, b.z), width: Math.abs(b.x - a.x) || 1, height: Math.abs(b.z - a.z) || 1 }; };
      for (const d of room.doors || []) {
        if (d.type === 'window') {
          svg.append(S('rect', { ...seg(d.wall, d.pos, d.w, -100, 0), fill: '#bfdbfe', stroke: '#2563eb', 'stroke-width': 12 }));
        } else {
          svg.append(S('rect', { ...seg(d.wall, d.pos, d.w, -100, 0), fill: '#f6f0e6' }));
          const hingeAt = d.swing === 'R' ? d.pos + d.w : d.pos;
          const h = wallPoint(room, d.wall, hingeAt, 0);
          const tip = wallPoint(room, d.wall, hingeAt, d.w);
          const end = wallPoint(room, d.wall, d.swing === 'R' ? d.pos : d.pos + d.w, 0);
          svg.append(S('path', { d: `M${h.x} ${h.z} L${tip.x} ${tip.z} A${d.w} ${d.w} 0 0 ${['A', 'B'].includes(d.wall) === (d.swing === 'R') ? 1 : 0} ${end.x} ${end.z}`, fill: '#fde68a55', stroke: '#a16207', 'stroke-width': 14 }));
        }
      }
      for (const tv of room.tv || []) {
        const w = (tv.size || 50) * 25.4 * 0.872;
        svg.append(S('rect', { ...seg(tv.wall, tv.pos - w / 2, w, 0, 50), fill: '#111' }));
        const c = wallPoint(room, tv.wall, tv.pos, 160);
        svg.append(txt(c.x, c.z, `TV ${tv.size || ''}″`, 100, { fill: '#111' }));
      }
      for (const s of room.sockets || []) {
        const c = wallPoint(room, s.wall, s.pos, 60);
        svg.append(S('circle', { cx: c.x, cy: c.z, r: 55, fill: s.type === 'switch' ? '#fff' : '#facc15', stroke: '#713f12', 'stroke-width': 12 }));
        const lc = wallPoint(room, s.wall, s.pos, 170);
        svg.append(txt(lc.x, lc.z, `${s.type === 'switch' ? 'sw' : '⚡'}${Math.round(s.y)}`, 80, { fill: '#713f12' }));
      }
      const fills = { bed: '#e7d3bd', combo: '#d6c7a9', cupboard: '#d6c7a9', kitchenRun: '#cbd5e1', kitchenBase: '#cbd5e1', kitchenWall: '#cbd5e1', kitchenTall: '#cbd5e1', nightstand: '#e7d3bd', custom: '#e5e7eb' };
      for (const e of entries) {
        if (!e.item.place) continue;
        const pl = e.item.place;
        const sel = e.item.id === selId;
        const g = S('g', { class: 'plan-item', 'data-id': e.item.id });
        const poly = (pts) => pts.map((q) => `${q.x},${q.z}`).join(' ');
        const outline = corners(e.fp, pl);
        g.append(S('polygon', { points: poly(outline), fill: fills[e.item.model] || '#e5e7eb', stroke: sel ? '#c2410c' : '#57534e', 'stroke-width': sel ? 30 : 12 }));
        for (const pn of e.out.panels) {
          if (['back', 'drawer', 'door'].includes(pn.role) || pn.box.y > 1400) continue;
          const b = pn.box;
          g.append(S('polygon', { points: poly(corners({ x0: b.x, x1: b.x + b.w, z0: b.z, z1: b.z + b.d }, pl)), fill: finishById(pn.color).hex, 'fill-opacity': 0.55, stroke: '#57534e', 'stroke-width': 4 }));
        }
        const bx = aabb(e.fp, pl);
        g.append(txt((bx.x0 + bx.x1) / 2, (bx.z0 + bx.z1) / 2, e.item.name, Math.min(160, (bx.x1 - bx.x0) / 6), { 'font-weight': 700, fill: '#1c1917', 'pointer-events': 'none' }));
        svg.append(g);
      }
      // dragging
      let drag = null;
      const toMMpt = (ev) => { const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; const q = pt.matrixTransform(svg.getScreenCTM().inverse()); return { x: q.x, z: q.y }; };
      svg.addEventListener('pointerdown', (ev) => {
        const g = ev.target.closest('.plan-item');
        if (!g) return;
        const e = entries.find((x) => x.item.id === g.dataset.id);
        if (!e) return;
        if (selId !== e.item.id) { selId = e.item.id; drawTools(); svg.querySelectorAll('.plan-item polygon:first-child').forEach((n) => n.setAttribute('stroke-width', 12)); g.firstChild.setAttribute('stroke-width', 30); g.firstChild.setAttribute('stroke', '#c2410c'); }
        drag = { e, g, start: toMMpt(ev), moved: false };
        svg.setPointerCapture(ev.pointerId);
        ev.preventDefault();
      });
      svg.addEventListener('pointermove', (ev) => {
        if (!drag) return;
        const q = toMMpt(ev);
        const dx = q.x - drag.start.x;
        const dz = q.z - drag.start.z;
        if (Math.hypot(dx, dz) > 20) drag.moved = true;
        drag.g.setAttribute('transform', `translate(${dx} ${dz})`);
        drag.d = { dx, dz };
      });
      const end = () => {
        if (!drag) return;
        const { e, d, moved } = drag;
        drag = null;
        if (moved && d) {
          const pl = e.item.place;
          pl.x += Math.round(d.dx / 10) * 10;
          pl.z += Math.round(d.dz / 10) * 10;
          // snap to walls within 150 mm
          const b = aabb(e.fp, pl);
          if (Math.abs(b.x0) < 150) pl.x -= b.x0;
          if (Math.abs(b.z0) < 150) pl.z -= b.z0;
          if (Math.abs(room.L - b.x1) < 150) pl.x += room.L - b.x1;
          if (Math.abs(room.W - b.z1) < 150) pl.z += room.W - b.z1;
        }
        refresh();
      };
      svg.addEventListener('pointerup', end);
      svg.addEventListener('pointercancel', end);
      return svg;
    }
    function room3D() {
      const box = el('div', { class: 'view3d', style: { height: '62dvh' } });
      const info = el('div', { class: 'pick-info', hidden: true });
      box.append(info, viewTools(() => viewer));
      const close = sheet('Room in 3D', [box, el('p', { class: 'muted tiny' }, 'Walls are see-through. Yellow = sockets on the plan, white squares = sockets and switches on the walls.')], { onClose: () => { if (viewer) { viewer.destroy(); viewer = null; } } });
      makeViewer(box, { onPick: (pn) => showPick(info, pn) }).then((v) => {
        viewer = v;
        if (!v) return;
        v.setModel([{ out: roomOut(room) }, ...entries.filter((e) => e.item.place).map((e) => ({ out: e.out, offset: [e.item.place.x, 0, e.item.place.z], rot: e.item.place.rot || 0 }))]);
      });
      return close;
    }
    function designForWall() {
      const pick = el('div', {});
      const show = (w) => {
        const spans = freeSpans(room, w, entries.filter((e) => e.item.id !== selId));
        pick.replaceChildren(
          el('p', { class: 'muted tiny' }, spans.length ? `Free on ${WALL_NAMES[w]} (between doors and furniture):` : 'No free space on this wall.'),
          spans.map(([a, b]) => el('div', { class: 'card', style: { marginBottom: '8px' } },
            el('b', {}, `${L(b - a)} free`), el('span', { class: 'muted tiny' }, ` · from ${L(a)} to ${L(b)}`),
            el('div', { class: 'row', style: { marginTop: '6px' } },
              el('button', { class: 'btn small', type: 'button', onclick: () => addFitted('combo', w, a, b) }, '🧥 Wardrobe + desk + coat'),
              el('button', { class: 'btn small', type: 'button', onclick: () => addFitted('cupboard', w, a, b) }, '🚪 Wardrobe'),
              el('button', { class: 'btn small', type: 'button', onclick: () => addFitted('kitchenRun', w, a, b) }, '🍳 Kitchen')))));
      };
      let closeFn = null;
      const addFitted = (model, w, a, b) => {
        const len = Math.floor((b - a) / 10) * 10;
        const params = model === 'combo' ? { space: len, ceil: room.H, height: Math.min(2200, room.H - 100) }
          : model === 'kitchenRun' ? { wallLen: len, ceiling: room.H }
          : { ...MODELS.cupboard.presets['Wardrobe 3-door 1500'], width: Math.min(len, 2400), height: Math.min(2200, room.H - 100) };
        const it = newItem(model, { name: model === 'combo' ? 'Wardrobe + desk' : model === 'kitchenRun' ? 'Kitchen' : 'Wardrobe', params });
        p.items.push(it);
        const out = buildItem(it, lib);
        const fp = footprint(out);
        it.place = placeAgainst(room, fp, w, a + (fp.x1 - fp.x0) / 2);
        selId = it.id;
        closeFn();
        refresh();
        toast(`${it.name} fitted to ${L(len)} on ${WALL_NAMES[w]}`);
      };
      closeFn = sheet('Design for a wall', [el('div', { class: 'seg' }, WALLS.map((w) => el('button', { type: 'button', onclick: (ev) => { ev.currentTarget.parentNode.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', 'false')); ev.currentTarget.setAttribute('aria-pressed', 'true'); show(w); } }, `Wall ${w}`))), pick]);
      show('A');
    }
    // room form
    const sizeFields = [
      { k: 'L', label: 'Length of walls A and C', type: 'num', len: true, min: 1000, max: 20000 },
      { k: 'W', label: 'Length of walls B and D', type: 'num', len: true, min: 1000, max: 20000 },
      { k: 'H', label: 'Ceiling height', type: 'num', len: true, min: 2000, max: 6000 },
    ];
    const wallOpt = WALLS.map((w) => [w, `Wall ${w}`]);
    const lists = [
      { k: 'doors', label: 'Doors and windows', type: 'list', help: 'Position = distance from the wall’s left end on the plan (top end for walls B and D) to the edge of the opening.', fields: [
        { k: 'type', label: 'Type', type: 'sel', def: 'door', opts: [['door', 'Door'], ['window', 'Window']] },
        { k: 'wall', label: 'Wall', type: 'sel', def: 'C', opts: wallOpt },
        { k: 'pos', label: 'Position', type: 'num', len: true, def: 500, min: 0 },
        { k: 'w', label: 'Width', type: 'num', len: true, def: 900, min: 300 },
        { k: 'h', label: 'Height', type: 'num', len: true, def: 2100, min: 300 },
        { k: 'y', label: 'Window sill height (0 for doors)', type: 'num', len: true, def: 0, min: 0 },
        { k: 'swing', label: 'Door hinge side', type: 'sel', def: 'L', opts: [['L', 'Left end'], ['R', 'Right end']] },
      ] },
      { k: 'sockets', label: 'Sockets and switches', type: 'list', help: 'Position = distance from the wall’s left end (top end for B and D) to the CENTRE of the socket.', fields: [
        { k: 'type', label: 'Type', type: 'sel', def: 'socket', opts: [['socket', 'Socket'], ['usb', 'USB socket'], ['switch', 'Switch']] },
        { k: 'wall', label: 'Wall', type: 'sel', def: 'A', opts: wallOpt },
        { k: 'pos', label: 'Position (centre)', type: 'num', len: true, def: 500, min: 0 },
        { k: 'y', label: 'Height (centre)', type: 'num', len: true, def: 300, min: 0 },
      ] },
      { k: 'tv', label: 'TV', type: 'list', help: 'Add one TV. The app checks the distance from the bed and the mounting height.', fields: [
        { k: 'wall', label: 'Wall', type: 'sel', def: 'C', opts: wallOpt },
        { k: 'pos', label: 'Position (centre)', type: 'num', len: true, def: 2000, min: 0 },
        { k: 'y', label: 'Height of the TV centre', type: 'num', len: true, def: 1100, min: 300 },
        { k: 'size', label: 'Screen size (inches)', type: 'num', def: 50, min: 19, max: 100 },
      ] },
    ];
    const form = el('div', { class: 'form', style: { padding: 0 } });
    let formT = 0;
    const drawForm = () => {
      form.replaceChildren(
        el('details', { open: !entries.some((e) => e.item.place) }, el('summary', {}, 'Room size'), el('div', { class: 'fields' }, sizeFields.map((f) => fieldRow(f, room[f.k], (v) => { room[f.k] = v; clearTimeout(formT); formT = setTimeout(refresh, 300); })))),
        lists.map((f) => el('details', {}, el('summary', {}, `${f.label} (${(room[f.k] || []).length})`), el('div', { class: 'fields' }, fieldRow({ ...f, k: f.k === 'tv' ? 'tv' : f.k }, room[f.k] || [], (v, how = {}) => {
          room[f.k] = f.k === 'tv' ? v.slice(0, 1) : v;
          if (how.rerender) { drawForm(); refresh(); } else { clearTimeout(formT); formT = setTimeout(refresh, 300); }
        })))),
        el('button', { class: 'btn small', type: 'button', style: { marginTop: '8px' }, onclick: async () => { if (await confirmBox('Remove the room? The furniture stays in the project.', 'Remove')) { delete p.room; p.items.forEach((i) => delete i.place); touch(); renderRoom(); } } }, 'Remove the room'));
    };
    drawForm();
    body.replaceChildren(el('div', { class: 'pad' }, planBox, tools, checks, unplaced, el('h2', { class: 'section-title' }, 'The room'), form));
    refresh();
  }

  function computeAll() {
    const results = buildProject(p, lib);
    const list = cutList(results, lib);
    return { results, list, edges: edgeBanding(list, lib), hw: hardware(results) };
  }

  function renderCut() {
    const { results, list, edges, hw } = computeAll();
    const wrap = el('div', { class: 'pad' });
    if (!list.length) { body.replaceChildren(el('div', { class: 'pad' }, el('p', { class: 'empty' }, 'Add some furniture first.'))); return; }
    const warnings = results.flatMap((r) => (r.out ? r.out.warnings.map((w) => `${r.item.name}: ${w}`) : [`${r.item.name}: ${r.error}`]));
    wrap.append(el('div', { class: 'row' },
      el('button', { class: 'btn primary', type: 'button', onclick: () => shareCutList(p, list, edges) }, '↗ Send to cutting shop'),
      el('button', { class: 'btn', type: 'button', onclick: () => downloadCSV(p, list) }, '⤓ CSV / Excel'),
      el('button', { class: 'btn', type: 'button', onclick: () => printReport(p, list, edges, hw) }, '🖨 Print / PDF'),
      el('button', { class: 'btn', type: 'button', onclick: () => printLabels(p, list) }, '🏷 Part labels')));
    if (warnings.length) wrap.append(el('div', { class: 'warn-box' }, el('b', {}, 'Check these'), el('ul', {}, warnings.slice(0, 12).map((w) => el('li', {}, w)))));
    const byMat = new Map();
    for (const g of list) { const k = g.mat + '|' + g.color; if (!byMat.has(k)) byMat.set(k, []); byMat.get(k).push(g); }
    for (const [k, rows] of byMat) {
      const [mid, col] = k.split('|');
      const m = matById(lib, mid);
      wrap.append(el('div', { class: 'mat-head' }, el('span', { class: 'dot', style: { background: finishById(col).hex } }), el('b', {}, `${m.name} · ${finishById(col).name}`), el('span', { class: 'muted tiny' }, `${rows.reduce((a, g) => a + g.qty, 0)} parts`)));
      wrap.append(partsTable(rows));
    }
    wrap.append(el('h2', { class: 'section-title' }, 'Edge banding'), simpleTable(['Edge band', 'Color', 'Pieces', 'Length'], edges.map((e) => [lib.edges.find((x) => x.id === e.edge)?.name || e.edge, finishById(e.color).name, e.pieces, `${e.m.toFixed(1)} m`]), [2, 3]));
    wrap.append(el('p', { class: 'muted tiny' }, `Includes ${lib.settings.edgeExtra} mm extra per edge and ${lib.settings.edgeWaste}% waste.${lib.settings.subtractThick ? ' Parts with 2 mm banding are cut smaller so the finished size is exact.' : ''}`));
    const hwRows = Object.entries(hw.hw).map(([k2, n]) => [lib.hardware[k2]?.name || k2, `${n} ${lib.hardware[k2]?.unit || ''}`]);
    wrap.append(el('h2', { class: 'section-title' }, 'Hardware'), simpleTable(['Item', 'Quantity'], hwRows, [1]));
    if (hw.linear.length) wrap.append(el('h2', { class: 'section-title' }, 'Metal, timber & other'), simpleTable(['Item', 'Length', 'Qty', 'Total'], hw.linear.map((l) => [l.name, l.area ? `${l.area.toFixed(2)} m²` : L(l.len), l.qty, l.area ? '' : `${((l.len * l.qty) / 1000).toFixed(2)} m`]), [1, 2, 3]));
    body.replaceChildren(wrap);
  }

  function partsTable(rows) {
    return el('div', { class: 'table-wrap' }, el('table', {},
      el('thead', {}, el('tr', {}, el('th', {}, '#'), el('th', {}, 'Part'), el('th', { class: 'num' }, `Cut size (${U()})`), el('th', { class: 'num' }, 'Qty'), el('th', {}, 'Edges'), el('th', {}, 'Grain'))),
      el('tbody', {}, rows.map((g) => el('tr', {},
        el('td', {}, el('b', {}, g.no)),
        el('td', { class: 'name' }, g.name, el('div', { class: 'muted tiny' }, g.itemNames.join(', '))),
        el('td', { class: 'num' }, `${L(g.cutL, false)} × ${L(g.cutW, false)}`, g.cutL !== g.L || g.cutW !== g.W ? el('div', { class: 'muted tiny' }, `finished ${L(g.L, false)} × ${L(g.W, false)}`) : null),
        el('td', { class: 'num' }, el('b', {}, g.qty)),
        el('td', { class: 'edges' }, edgeText(g)),
        el('td', {}, g.grain ? '↔ length' : '—'))))));
  }

  function renderSheets() {
    const { list } = computeAll();
    const mode = p.cutMode || lib.settings.cutMode;
    const layouts = layoutSheets(list, lib, mode);
    const wrap = el('div', { class: 'pad' });
    if (!list.length) { body.replaceChildren(el('div', { class: 'pad' }, el('p', { class: 'empty' }, 'Add some furniture first.'))); return; }
    const total = layouts.reduce((a, l) => a + l.sheets.length, 0);
    wrap.append(
      el('div', { class: 'seg' },
        el('button', { type: 'button', 'aria-pressed': String(mode === 'strips'), onclick: () => { p.cutMode = 'strips'; touch(); renderSheets(); } }, '✂ Easy cutting (strips)'),
        el('button', { type: 'button', 'aria-pressed': String(mode === 'yield'), onclick: () => { p.cutMode = 'yield'; touch(); renderSheets(); } }, '⬚ Fewest sheets')),
      el('p', { class: 'muted tiny' }, mode === 'strips'
        ? 'Cut full-length strips first, then cross-cut: fast and safe on a panel saw or table saw. Tap a sheet for the step-by-step cuts.'
        : 'Packs parts tighter to save boards. Every cut still goes straight through (guillotine), so any saw can cut it.'),
      el('div', { class: 'note-box' }, el('b', {}, `${total} sheet${total === 1 ? '' : 's'} in total`), ` · saw blade ${lib.settings.kerf} mm · edge trim ${lib.settings.trim} mm`),
      el('div', { class: 'legend' }, Object.entries({ Doors: 'door', Carcass: 'carcass', Shelves: 'shelf', Backs: 'back', Drawers: 'drawer', 'Bed deck': 'deck', Headboard: 'head', Rails: 'rail' }).map(([lbl, r]) => el('span', {}, el('i', { style: { background: ROLE_COLORS[r] } }), lbl)),
        el('span', {}, el('i', { style: { background: '#2563eb' } }), 'thin edge band'), el('span', {}, el('i', { style: { background: '#b91c1c' } }), '2 mm edge band'), el('span', {}, el('i', { style: { background: '#86efac' } }), 'offcut')));
    for (const lay of layouts) {
      wrap.append(el('div', { class: 'mat-head' }, el('span', { class: 'dot', style: { background: finishById(lay.color).hex } }),
        el('div', { class: 'grow' }, el('b', {}, `${lay.material.name} · ${finishById(lay.color).name}`),
          el('div', { class: 'muted tiny' }, `${lay.sheets.length} sheet${lay.sheets.length === 1 ? '' : 's'} of ${L(lay.sheetL, false)} × ${L(lay.sheetW)} · ${Math.round(lay.util * 100)}% used · ${lay.partCount} parts` + (lay.alt.strips !== lay.alt.yield ? ` · (easy cutting ${lay.alt.strips} / fewest ${lay.alt.yield})` : '')))));
      if (lay.tooBig.length) wrap.append(el('div', { class: 'warn-box' }, `Too big for this sheet: ${[...new Set(lay.tooBig.map((x) => '#' + x.no))].join(', ')}. Make them smaller, or set a bigger sheet in Materials.`));
      wrap.append(el('div', { class: 'sheet-grid' }, lay.sheets.map((sh, i) => el('div', { class: 'sheet-card' },
        el('div', { class: 'row-between' }, el('b', {}, `Sheet ${i + 1}`), el('span', { class: 'muted tiny' }, `${Math.round(sh.util * 100)}% used · ${sh.placements.length} parts`)),
        el('button', { class: 'view', type: 'button', 'aria-label': `Open sheet ${i + 1}`, onclick: () => openSheet(lay, sh, i, list) }, sheetSVG(lay, sh, list, U()))))));
    }
    body.replaceChildren(wrap);
  }

  function openSheet(lay, sh, i, list) {
    const parts = new Map();
    for (const pl of sh.placements) parts.set(pl.no, (parts.get(pl.no) || 0) + 1);
    sheet(`${lay.material.name} · ${finishById(lay.color).name} · sheet ${i + 1}`, [
      sheetSVG(lay, sh, list, U(), { big: true }),
      el('p', { class: 'muted tiny' }, [...parts].map(([no, n]) => `#${no} ${list.find((g) => g.no === no)?.name || ''} ×${n}`).join(' · ')),
      sh.steps && sh.steps.length ? [el('b', {}, 'Saw steps'), el('div', { class: 'steps' }, [`Trim ${lay.trim} mm off the factory edges.`, ...sh.steps.map((s) => s.text)].join('\n'))] : null,
      sh.offcuts && sh.offcuts.length ? el('p', { class: 'muted tiny' }, 'Keep these offcuts: ' + sh.offcuts.map((o) => `${Math.round(o.w)}×${Math.round(o.h)}`).join(', ')) : null,
    ]);
  }

  function renderCost() {
    const { list, edges, hw } = computeAll();
    const mode = p.cutMode || lib.settings.cutMode;
    const layouts = layoutSheets(list, lib, mode);
    const c = costs(p, lib, layouts, edges, hw);
    const wrap = el('div', { class: 'pad' });
    const totals = el('div', { class: 'total-box' });
    const recalc = () => {
      const c2 = costs(p, lib, layouts, edges, hw);
      totals.replaceChildren(
        el('div', { class: 'row-between' }, el('span', {}, 'Materials'), el('b', {}, money(c2.materials))),
        el('div', { class: 'row-between' }, el('span', {}, `Labour (${p.labour ?? lib.settings.labour}%)`), el('b', {}, money(c2.labour))),
        el('div', { class: 'row-between' }, el('span', {}, `Profit (${p.profit ?? lib.settings.profit}%)`), el('b', {}, money(c2.profit))),
        el('div', { class: 'row-between', style: { marginTop: '8px' } }, el('span', {}, 'Price for the client'), el('span', { class: 'big' }, money(c2.total))),
        c2.missingPrices ? el('p', { class: 'muted tiny' }, `${c2.missingPrices} item${c2.missingPrices === 1 ? ' has' : 's have'} no price yet. Type them in below; they are saved for every project.`) : null);
    };
    const priceInput = (line) => {
      const inp = el('input', { class: 'price-in', type: 'number', min: 0, step: 'any', value: line.price ? Math.round(line.price) : '', placeholder: '0', 'aria-label': `Price for ${line.label}` });
      inp.addEventListener('change', () => {
        const v = Number(inp.value) || 0;
        const [kind, id] = (line.key || '').split(':');
        const target = kind === 'mat' ? lib.materials.find((m) => m.id === id) : kind === 'edge' ? lib.edges.find((e) => e.id === id) : kind === 'hw' ? lib.hardware[id] : null;
        if (target) { target.price = v; target.priceHi = v; saveLib(); }
        renderCost();
      });
      return inp;
    };
    wrap.append(
      el('div', { class: 'table-wrap' }, el('table', {},
        el('thead', {}, el('tr', {}, el('th', {}, 'Item'), el('th', { class: 'num' }, 'Qty'), el('th', { class: 'num' }, `Price (${lib.settings.currency})`), el('th', { class: 'num' }, 'Total'))),
        el('tbody', {}, c.lines.map((ln) => el('tr', {}, el('td', { class: 'name' }, ln.label), el('td', { class: 'num' }, `${ln.qty} ${ln.unit}`), el('td', { class: 'num' }, priceInput(ln)), el('td', { class: 'num' }, money(ln.qty * ln.price))))))),
      el('div', { class: 'row', style: { marginTop: '12px' } },
        el('label', { class: 'field-block grow' }, 'Labour %', el('input', { type: 'number', value: p.labour ?? lib.settings.labour, oninput: (e) => { p.labour = Number(e.target.value) || 0; touch(); recalc(); } })),
        el('label', { class: 'field-block grow' }, 'Profit %', el('input', { type: 'number', value: p.profit ?? lib.settings.profit, oninput: (e) => { p.profit = Number(e.target.value) || 0; touch(); recalc(); } }))),
      totals,
      el('div', { class: 'seg', style: { marginTop: '12px' } }, [['low', 'Lowest prices'], ['mid', 'Middle'], ['high', 'Highest prices']].map(([k, t]) => el('button', { type: 'button', 'aria-pressed': String((lib.settings.priceLevel || 'mid') === k), onclick: () => { lib.settings.priceLevel = k; saveLib(); renderCost(); } }, t))),
      el('p', { class: 'muted tiny' }, 'Shops charge different prices: the range comes from Materials. Quote with “Highest” to stay safe.'),
      el('button', { class: 'btn primary wide', type: 'button', style: { marginTop: '12px' }, onclick: () => shareQuote(p, costs(p, lib, layouts, edges, hw)) }, '↗ Send a quote to the client'));
    recalc();
    body.replaceChildren(wrap);
  }

  host.replaceChildren(
    el('div', { class: 'layer-head' }, el('button', { class: 'icon-btn ghost', type: 'button', 'aria-label': 'Back', onclick: popLayer }, '‹'), nameBtn,
      el('button', { class: 'btn small primary', type: 'button', onclick: () => { const it = null; addItemPanelProxy(); } }, '+ Add')),
    tabsBar, body);
  const addItemPanelProxy = () => { show('items'); setTimeout(() => body.querySelector('.btn.primary.wide')?.click(), 30); };
  host.hidden = false;
  show(startTab);
  pushLayer(() => { if (viewer) viewer.destroy(); host.hidden = true; host.replaceChildren(); });
  host._refresh = () => show(current);
}

function edgeText(g) {
  const parts = [];
  if (g.eL) parts.push(`L${g.eL}`);
  if (g.eW) parts.push(`W${g.eW}`);
  if (!parts.length) return '—';
  return parts.join(' ') + (g.edge === 'thick' ? ' ▮2mm' : g.edge === 'wide' ? ' ▮42' : '');
}
function simpleTable(head, rows, numCols = []) {
  if (!rows.length) return el('p', { class: 'muted tiny' }, 'None.');
  return el('div', { class: 'table-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, head.map((h, i) => el('th', { class: numCols.includes(i) ? 'num' : '' }, h)))),
    el('tbody', {}, rows.map((r) => el('tr', {}, r.map((c, i) => el('td', { class: numCols.includes(i) ? 'num' : 'name' }, c)))))));
}

function viewTools(getViewer) {
  let ex = false;
  let op = false;
  const exBtn = el('button', { type: 'button', 'aria-pressed': 'false', onclick: () => { ex = !ex; exBtn.setAttribute('aria-pressed', String(ex)); getViewer()?.setExplode(ex ? 1 : 0); } }, '💥 Explode');
  const opBtn = el('button', { type: 'button', 'aria-pressed': 'false', onclick: () => { op = !op; opBtn.setAttribute('aria-pressed', String(op)); getViewer()?.setOpen(op ? 1 : 0); } }, '🚪 Open doors');
  return el('div', { class: 'view-tools' }, exBtn, opBtn, el('button', { type: 'button', onclick: () => getViewer()?.fit() }, '⤢ Fit'));
}
function showPick(info, pn) {
  if (!pn) { info.hidden = true; return; }
  const m = matById(lib, pn.mat);
  info.replaceChildren(el('b', {}, pn.name), el('br'), `${L(pn.L, false)} × ${L(pn.W)} · ${m.name} · ${finishById(pn.color).name}`, pn.eL || pn.eW ? el('br') : null, pn.eL || pn.eW ? `Edges: ${edgeText(pn)}` : null, pn.note ? [el('br'), el('span', { style: { opacity: 0.85 } }, pn.note)] : null);
  info.hidden = false;
}

/* ================================================================ item editor (design + live 3D) */
async function openItem(p, item) {
  const host = $('#layer-item');
  const model = MODELS[item.model];
  item.params = { ...defaults(model), ...item.params };
  const box = el('div', { class: 'view3d' });
  const size = el('div', { class: 'view-size' });
  const info = el('div', { class: 'pick-info', hidden: true });
  let viewer = null;
  box.append(size, info, viewTools(() => viewer));
  const nameBtn = el('button', { class: 'name', type: 'button' }, item.name);
  nameBtn.addEventListener('click', async () => { const n = await ask('Rename', '', item.name); if (n) { item.name = n; nameBtn.textContent = n; save(); } });
  const presets = el('div', { class: 'presets' });
  const msgs = el('div', { class: 'form' });
  const form = el('div', { class: 'form' });
  const partsBox = el('div', { class: 'form' });
  const scroll = el('div', { class: 'layer-body' }, presets, msgs, form, partsBox);
  host.replaceChildren(
    el('div', { class: 'layer-head' }, el('button', { class: 'icon-btn ghost', type: 'button', 'aria-label': 'Back', onclick: popLayer }, '‹'), nameBtn,
      el('span', { class: 'muted tiny' }, 'Qty'),
      el('input', { type: 'number', min: 1, max: 999, value: item.qty, style: { width: '64px', padding: '7px', border: '1px solid var(--line)', borderRadius: '10px' }, oninput: (e) => { item.qty = Math.max(1, Number(e.target.value) || 1); save(); } })),
    el('div', { class: 'editor' }, box, scroll));
  host.hidden = false;

  let saveT = 0;
  function save() {
    p.updated = Date.now();
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      try { if (viewer) item.thumb = viewer.snapshot(220); } catch { /* ignore */ }
      saveProjects();
    }, 600);
  }

  let buildT = 0;
  let firstBuild = true;
  function rebuild(delay = 0) {
    clearTimeout(buildT);
    buildT = setTimeout(() => {
      let out;
      try { out = buildItem(item, lib); } catch (e) { msgs.replaceChildren(el('div', { class: 'warn-box' }, 'These settings don’t work together: ' + e.message)); return; }
      size.textContent = `${L(out.size.w, false)} × ${L(out.size.h, false)} × ${L(out.size.d)}`;
      const hasHinges = out.panels.some((x) => x.hinges && x.hinges.length);
      msgs.replaceChildren(
        hasHinges || item.params.grade ? el('div', { class: 'row' },
          hasHinges ? el('button', { class: 'btn small', type: 'button', onclick: () => hingeSheet(item, out) }, '🔩 How to fit the hinges') : null,
          item.params.grade ? el('span', { class: 'muted tiny' }, `${GRADES[item.params.grade]?.name || ''}: ${GRADES[item.params.grade]?.note || ''}`) : null) : null,
        out.warnings.length ? el('div', { class: 'warn-box' }, el('b', {}, '⚠ Check'), el('ul', {}, out.warnings.map((w) => el('li', {}, w)))) : null,
        out.notes.length ? el('details', { class: 'note-box', open: firstBuild }, el('summary', {}, el('b', {}, 'Workshop notes')), el('ul', {}, out.notes.map((n) => el('li', {}, n)))) : null);
      const tmp = cutList([{ item: { ...item, qty: 1 }, out }], lib);
      partsBox.replaceChildren(el('details', {}, el('summary', {}, `Parts for one (${out.panels.length})`), el('div', { style: { padding: '0 10px 10px' } }, partsTableSimple(tmp))));
      if (viewer) viewer.setModel([{ out }], { keepCamera: !firstBuild });
      firstBuild = false;
      save();
    }, delay);
  }

  function renderPresets() {
    const names = Object.keys(model.presets || {});
    presets.replaceChildren(names.length ? el('div', { class: 'chips', role: 'group', 'aria-label': 'Standards' }, names.map((n) => el('button', { type: 'button', onclick: () => {
      item.params = { ...defaults(model), ...structuredClone(model.presets[n]) };
      renderForm();
      rebuild();
      toast(`Using “${n}”. Adjust anything below.`);
    } }, n))) : null);
  }

  const openSecs = new Set();
  function renderForm() {
    form.querySelectorAll('details').forEach((d) => { const k = d.dataset.sec; if (d.open) openSecs.add(k); else openSecs.delete(k); });
    const sections = [];
    for (const f of model.params) {
      if (!sections.includes(f.section || 'Settings')) sections.push(f.section || 'Settings');
    }
    form.replaceChildren(...sections.map((sec, i) => {
      const fields = model.params.filter((f) => (f.section || 'Settings') === sec && (!f.when || f.when(item.params)));
      if (!fields.length) return null;
      return el('details', { open: openSecs.size ? openSecs.has(sec) : i === 0, 'data-sec': sec }, el('summary', {}, sec), el('div', { class: 'fields' }, fields.map((f) => fieldRow(f, item.params[f.k], (v, how = {}) => {
        item.params[f.k] = v;
        if (how.sets) { Object.assign(item.params, structuredClone(how.sets)); toast(`${f.opts.find((o) => o[0] === v)?.[1] || v}: boards and hardware updated`); }
        if (how.rerender) renderForm();
        rebuild(how.live ? 250 : 0);
      }))));
    }).filter(Boolean));
  }

  renderPresets();
  renderForm();
  pushLayer(() => { clearTimeout(saveT); try { if (viewer) item.thumb = viewer.snapshot(220); } catch { /* ignore */ } saveProjects(); if (viewer) viewer.destroy(); host.hidden = true; host.replaceChildren(); $('#layer-project')._refresh?.(); });
  rebuild();
  viewer = await makeViewer(box, { onPick: (pn) => showPick(info, pn) });
  firstBuild = true;
  rebuild();
}

/* hinge drawing + drilling guide for one design */
function hingeSheet(item, out) {
  const doors = out.panels.filter((x) => x.hinges && x.hinges.length);
  const groups = new Map();
  for (const d of doors) {
    const k = `${d.door.hingeType}|${Math.round(d.box.w)}|${Math.round(d.box.h)}|${d.door.hinge}`;
    if (!groups.has(k)) groups.set(k, { d, n: 0 });
    groups.get(k).n++;
  }
  const NS = 'http://www.w3.org/2000/svg';
  const S = (tag, attrs = {}, ...kids) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); n.append(...kids.flat().filter((x) => x != null)); return n; };
  const drawing = (d) => {
    const w = d.box.w;
    const h = d.box.h;
    const flapT = d.door.hinge === 'T';
    const flapB = d.door.hinge === 'B';
    const sc = 240 / Math.max(w, h);
    const W = w * sc;
    const H = h * sc;
    const svg = S('svg', { viewBox: `-70 -30 ${W + 150} ${H + 70}`, class: 'hinge-svg' });
    svg.append(S('rect', { x: 0, y: 0, width: W, height: H, fill: '#f5ede0', stroke: '#57534e', 'stroke-width': 1.5, rx: 2 }));
    svg.append(S('text', { x: W / 2, y: -12, 'text-anchor': 'middle', 'font-size': 11, fill: '#57534e' }, `${L(w, false)} × ${L(h)} · seen from the back`));
    for (const hp of d.hinges) {
      let cx, cy;
      if (flapT || flapB) { cx = hp * sc; cy = flapT ? 22.5 * sc : H - 22.5 * sc; }
      else { cx = d.door.hinge === 'R' ? 22.5 * sc : W - 22.5 * sc; cy = hp * sc; } // seen from the back: left hinge appears on the right
      svg.append(S('circle', { cx, cy, r: Math.max(5, 17.5 * sc), fill: '#fff', stroke: '#c2410c', 'stroke-width': 2 }));
      if (flapT || flapB) svg.append(S('text', { x: cx, y: flapT ? cy + 18 : cy - 12, 'text-anchor': 'middle', 'font-size': 10, fill: '#c2410c' }, `${hp}`));
      else svg.append(S('text', { x: d.door.hinge === 'R' ? -8 : W + 8, y: cy + 3.5, 'text-anchor': d.door.hinge === 'R' ? 'end' : 'start', 'font-size': 10, fill: '#c2410c' }, `${hp}`));
    }
    svg.append(S('text', { x: W / 2, y: H + 22, 'text-anchor': 'middle', 'font-size': 10, fill: '#57534e' }, `Ø35 cups · mm from the ${flapT || flapB ? 'left' : 'top'}`));
    return svg;
  };
  const types = [...new Set(doors.map((d) => d.door.hingeType))];
  const doorT = doors[0] ? Math.round(doors[0].box.d) : 18;
  const kind = doors[0] ? matById(lib, doors[0].mat).kind : 'MDF';
  sheet(`Hinges · ${item.name}`, [
    el('p', { class: 'muted tiny' }, `${doors.length} door${doors.length > 1 ? 's' : ''}, ${doors.reduce((a, d) => a + d.hinges.length, 0)} hinges in total.`),
    [...groups.values()].map(({ d, n }) => el('div', { class: 'card', style: { marginBottom: '10px' } },
      el('b', {}, `${n} × ${HINGE_TYPES[d.door.hingeType]?.name || 'Hinge'}`), el('div', { class: 'muted tiny' }, d.note), drawing(d))),
    types.map((t) => [el('h3', { class: 'section-title' }, `Fitting: ${HINGE_TYPES[t]?.name}`), el('p', { class: 'muted tiny' }, HINGE_TYPES[t]?.use), el('ol', { class: 'steps-list' }, hingeGuide(t, doorT, kind).map((x) => el('li', {}, x)))]),
    el('h3', { class: 'section-title' }, 'Other hinge types you can choose'),
    el('ul', { class: 'steps-list' }, Object.entries(HINGE_TYPES).filter(([k]) => !types.includes(k)).map(([, h]) => el('li', {}, el('b', {}, h.name), ` – ${h.use}`))),
  ]);
}

function partsTableSimple(list) {
  return el('div', { class: 'table-wrap' }, el('table', {},
    el('thead', {}, el('tr', {}, el('th', {}, 'Part'), el('th', { class: 'num' }, 'Size'), el('th', { class: 'num' }, 'Qty'), el('th', {}, 'Board'), el('th', {}, 'Edges'))),
    el('tbody', {}, list.map((g) => el('tr', {}, el('td', { class: 'name' }, g.name), el('td', { class: 'num' }, `${L(g.cutL, false)} × ${L(g.cutW, false)}`), el('td', { class: 'num' }, g.qty), el('td', {}, `${matById(lib, g.mat).T} mm · ${finishById(g.color).name}`), el('td', { class: 'edges' }, edgeText(g)))))));
}

/* one setting in the form */
function fieldRow(f, value, onChange) {
  const label = el('span', {}, f.label);
  let input;
  if (f.type === 'num') {
    const shown = f.len ? Math.round(fromMM(value, U()) * 100) / 100 : value;
    const inp = el('input', { type: 'number', inputmode: 'decimal', value: shown, min: f.min !== undefined ? (f.len ? fromMM(f.min, U()) : f.min) : undefined, max: f.max !== undefined ? (f.len ? fromMM(f.max, U()) : f.max) : undefined, step: f.len ? (U() === 'mm' ? 1 : U() === 'cm' ? 0.1 : 0.01) : f.step || 1, 'aria-label': f.label });
    const read = () => {
      let v = Number(inp.value);
      if (!isFinite(v) || inp.value === '') return null;
      if (f.len) v = toMM(v, U());
      if (f.min !== undefined) v = Math.max(f.min, v);
      if (f.max !== undefined) v = Math.min(f.max, v);
      return v;
    };
    inp.addEventListener('input', () => { const v = read(); if (v !== null) onChange(v, { live: true }); });
    inp.addEventListener('change', () => { const v = read(); if (v !== null) { inp.value = f.len ? Math.round(fromMM(v, U()) * 100) / 100 : v; onChange(v, { rerender: !!f.rerender }); } });
    input = f.len ? el('div', { class: 'unit-wrap' }, inp, el('span', {}, U())) : inp;
  } else if (f.type === 'sel') {
    input = el('select', { 'aria-label': f.label, onchange: (e) => onChange(e.target.value, { rerender: true, sets: f.sets ? f.sets(e.target.value) : null }) }, f.opts.map(([v, t]) => el('option', { value: v, selected: String(value) === String(v) }, t)));
  } else if (f.type === 'bool') {
    input = el('input', { type: 'checkbox', class: 'switch', checked: !!value, 'aria-label': f.label, onchange: (e) => onChange(e.target.checked, { rerender: true }) });
  } else if (f.type === 'mat') {
    const roles = Object.keys(ROLE_MATS.et);
    const boards = lib.materials.filter((m) => inRegion(m) || m.id === value);
    input = el('select', { 'aria-label': f.label, onchange: (e) => onChange(e.target.value, { rerender: true }) },
      el('optgroup', { label: 'Automatic (follows Materials → default boards)' }, roles.map((r) => el('option', { value: '@' + r, selected: value === '@' + r }, `${ROLE_NAMES[r]}: ${matById(lib, '@' + r).name}`))),
      el('optgroup', { label: region() === 'et' ? 'Boards in Ethiopia' : 'Standard boards' }, boards.map((m) => el('option', { value: m.id, selected: value === m.id }, `${m.name}${priceOf(m, lib) ? ` · ${Math.round(priceOf(m, lib)).toLocaleString()} ${lib.settings.currency}` : ''}`))));
  } else if (f.type === 'color') {
    const box = el('div', { class: 'swatches', role: 'group', 'aria-label': f.label });
    for (const c of FINISHES) box.append(el('button', { type: 'button', title: c.name, 'aria-label': c.name, 'aria-pressed': String(value === c.id), style: { background: c.hex }, onclick: (e) => { box.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); onChange(c.id); } }));
    const custom = el('input', { type: 'color', value: String(value).startsWith('#') ? value : finishById(value).hex, 'aria-label': 'Any color' });
    custom.addEventListener('change', () => onChange(custom.value));
    box.append(custom);
    return el('div', { class: 'field' }, label, box, f.help ? el('div', { class: 'help' }, f.help) : null);
  } else if (f.type === 'text') {
    input = el('input', { type: 'text', value: value ?? '', 'aria-label': f.label, oninput: (e) => onChange(e.target.value, { live: true }) });
  } else if (f.type === 'list') {
    const rows = Array.isArray(value) ? structuredClone(value) : [];
    const editor = el('div', { class: 'list-editor' });
    const draw = () => {
      editor.replaceChildren(...rows.map((r, i) => el('div', { class: 'list-row' },
        el('div', { class: 'row-between' }, `${f.k === 'sections' ? 'Section' : 'Part'} ${i + 1}`, el('button', { class: 'btn small', type: 'button', onclick: () => { rows.splice(i, 1); onChange(structuredClone(rows), { rerender: true }); } }, 'Remove')),
        f.fields.map((sf) => fieldRow(sf, r[sf.k] ?? sf.def, (v, how = {}) => { r[sf.k] = v; onChange(structuredClone(rows), { live: how.live, rerender: false }); })))),
        el('button', { class: 'btn small', type: 'button', onclick: () => { rows.push(Object.fromEntries(f.fields.map((sf) => [sf.k, sf.def]))); onChange(structuredClone(rows), { rerender: true }); } }, f.k === 'sections' ? '+ Add section' : '+ Add part'));
    };
    draw();
    return el('div', { class: 'field' }, el('div', { class: 'list-editor' }, f.help ? el('div', { class: 'help', style: { marginTop: 0 } }, f.help) : null, editor));
  }
  return el('div', { class: 'field' }, label, input, f.help ? el('div', { class: 'help' }, f.help) : null);
}

/* ================================================================ sharing, CSV, printing */
function cutText(p, list, edges) {
  const lines = [`${lib.settings.shop} · Cut list: ${p.name}${p.client ? ' (' + p.client + ')' : ''}`, `Sizes in ${U()} (length × width), saw blade ${lib.settings.kerf} mm`, ''];
  const byMat = new Map();
  for (const g of list) { const k = g.mat + '|' + g.color; if (!byMat.has(k)) byMat.set(k, []); byMat.get(k).push(g); }
  const lays = layoutSheets(list, lib, p.cutMode || lib.settings.cutMode);
  for (const [k, rows] of byMat) {
    const [mid, col] = k.split('|');
    const m = matById(lib, mid);
    const lay = lays.find((x) => x.mat === mid && x.color === col);
    lines.push(`▶ ${m.name} · ${finishById(col).name}${lay ? ` · ${lay.sheets.length} sheet${lay.sheets.length === 1 ? '' : 's'} ${m.sheetL}×${m.sheetW}` : ''}`);
    for (const g of rows) lines.push(`#${g.no} ${L(g.cutL, false)} × ${L(g.cutW, false)} ×${g.qty}${g.eL || g.eW ? ` · edges ${edgeText(g)}` : ''}${g.grain ? ' · grain ↔' : ''} · ${g.name}`);
    lines.push('');
  }
  if (edges.length) lines.push('Edge banding: ' + edges.map((e) => `${lib.edges.find((x) => x.id === e.edge)?.name || e.edge} ${finishById(e.color).name} ${e.m.toFixed(1)} m`).join('; '));
  lines.push('', 'Edges: L = long sides, W = short sides (number of sides banded).');
  return lines.join('\n');
}
async function shareText(text, title) {
  try {
    if (navigator.share) { await navigator.share({ title, text }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text); toast('Copied. Paste it into WhatsApp or Telegram.'); } catch {
    sheet(title, el('textarea', { rows: 16, style: { width: '100%', fontFamily: 'monospace', fontSize: '.8rem' } }, text));
  }
}
function shareCutList(p, list, edges) { shareText(cutText(p, list, edges), `Cut list · ${p.name}`); }
function shareQuote(p, c) {
  const text = [`${lib.settings.shop} · Quote`, `Project: ${p.name}${p.client ? ' · ' + p.client : ''}`, '', ...p.items.map((i) => `• ${i.qty > 1 ? i.qty + ' × ' : ''}${i.name}`), '', `Total: ${money(c.total)}`, `Materials ${money(c.materials)} · Work ${money(c.labour + c.profit)}`, '', `Date: ${new Date().toLocaleDateString()}`].join('\n');
  shareText(text, `Quote · ${p.name}`);
}
function downloadCSV(p, list) {
  const head = ['No', 'Part', 'Material', 'Color', 'Thickness', 'Cut length', 'Cut width', 'Qty', 'Edges long', 'Edges short', 'Edge type', 'Grain', 'Finished length', 'Finished width', 'Furniture'];
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = list.map((g) => [g.no, g.name, matById(lib, g.mat).name, finishById(g.color).name, g.T, g.cutL, g.cutW, g.qty, g.eL, g.eW, g.edge, g.grain ? 'yes' : 'no', g.L, g.W, g.itemNames.join(' / ')]);
  const csv = '﻿' + [head, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  downloadBlob(new Blob([csv], { type: 'text/csv' }), `${p.name} cut list.csv`);
}
function printReport(p, list, edges, hw) {
  const pr = $('#print');
  const lays = layoutSheets(list, lib, p.cutMode || lib.settings.cutMode);
  pr.replaceChildren(
    el('h1', {}, `${p.name} · cut list`), el('p', {}, `${lib.settings.shop}${p.client ? ' · ' + p.client : ''} · ${new Date().toLocaleDateString()} · sizes in ${U()} · blade ${lib.settings.kerf} mm`),
    el('table', {}, el('tr', {}, ['#', 'Part', 'Board', 'Cut L × W', 'Qty', 'Edges', 'Grain'].map((h) => el('th', {}, h))),
      list.map((g) => el('tr', {}, el('td', {}, g.no), el('td', {}, g.name), el('td', {}, `${matById(lib, g.mat).name} · ${finishById(g.color).name}`), el('td', {}, `${L(g.cutL, false)} × ${L(g.cutW, false)}`), el('td', {}, g.qty), el('td', {}, edgeText(g)), el('td', {}, g.grain ? '↔' : '')))),
    el('h2', {}, 'Edge banding'), el('p', {}, edges.map((e) => `${lib.edges.find((x) => x.id === e.edge)?.name} · ${finishById(e.color).name}: ${e.m.toFixed(1)} m`).join(' · ') || 'None'),
    el('h2', {}, 'Hardware'), el('p', {}, Object.entries(hw.hw).map(([k, n]) => `${lib.hardware[k]?.name || k}: ${n}`).join(' · ')),
    hw.linear.length ? [el('h2', {}, 'Metal, timber & other'), el('p', {}, hw.linear.map((l) => `${l.name}: ${l.area ? l.area.toFixed(2) + ' m²' : L(l.len) + ' × ' + l.qty}`).join(' · '))] : null,
    el('div', { class: 'page-break' }),
    lays.map((lay) => lay.sheets.map((sh, i) => el('div', { class: 'print-sheet' }, el('h2', {}, `${lay.material.name} · ${finishById(lay.color).name} · sheet ${i + 1} of ${lay.sheets.length}`), sheetSVG(lay, sh, list, U(), { big: true }),
      sh.steps && sh.steps.length ? el('p', { style: { fontSize: '8pt', whiteSpace: 'pre-wrap' } }, sh.steps.map((s) => s.text.trim()).join(' · ')) : null))));
  setTimeout(() => window.print(), 100);
}
function printLabels(p, list) {
  const pr = $('#print');
  const labels = [];
  for (const g of list) for (let i = 0; i < g.qty; i++) labels.push(el('div', { class: 'label' }, el('b', {}, `#${g.no}`), ` ${g.name}`, el('br'), `${L(g.cutL, false)} × ${L(g.cutW, false)} · ${matById(lib, g.mat).T} mm ${finishById(g.color).name}`, el('br'), `Edges: ${edgeText(g)}${g.grain ? ' · grain ↔' : ''}`, el('br'), el('small', {}, `${p.name} · ${g.itemNames.join(', ')}`)));
  pr.replaceChildren(el('div', { class: 'labels' }, labels));
  setTimeout(() => window.print(), 100);
}

/* ================================================================ materials & prices */
function renderMaterials() {
  const body = $('#materials-body');
  const cur = lib.settings.currency;
  const num = (obj, key, attrs = {}) => el('input', { class: 'price-in', type: 'number', step: 'any', value: obj[key] ?? '', ...attrs, onchange: (e) => { obj[key] = Number(e.target.value) || 0; if (key === 'price' && (!obj.priceHi || obj.priceHi < obj.price)) obj.priceHi = obj.price; saveLib(); } });
  const rg = region();
  const roles = lib.roles[rg] || {};
  const boards = lib.materials.filter(inRegion);
  body.replaceChildren(
    el('div', { class: 'seg' },
      el('button', { type: 'button', 'aria-pressed': String(rg === 'et'), onclick: () => { lib.settings.region = 'et'; saveLib(); renderMaterials(); toast('Using boards from the Ethiopian market'); } }, '🇪🇹 Ethiopia market'),
      el('button', { type: 'button', 'aria-pressed': String(rg === 'std'), onclick: () => { lib.settings.region = 'std'; saveLib(); renderMaterials(); toast('Using the standard (international) boards'); } }, 'Standard boards')),
    el('p', { class: 'muted' }, rg === 'et'
      ? `Boards you can buy in Ethiopia, priced in ${cur}. Backs and drawer bottoms use 3 mm MDF (no HDF). Prices are a range (low – high) because shops differ.`
      : 'International standard boards (MDF, melamine chipboard, plywood, HDF backs). Type your prices.'),
    el('h2', { class: 'section-title' }, 'Default board for each job'),
    el('p', { class: 'muted tiny' }, 'Designs set to “Automatic” use these. Change one here and every design follows.'),
    el('div', { class: 'fields card' }, Object.keys(ROLE_MATS.et).map((r) => el('div', { class: 'field' }, el('span', {}, ROLE_NAMES[r]),
      el('select', { onchange: (e) => { lib.roles[rg] = { ...roles, [r]: e.target.value }; saveLib(); toast('Saved'); } }, boards.map((m) => el('option', { value: m.id, selected: (roles[r] || ROLE_MATS[rg][r]) === m.id }, m.name)))))),
    el('h2', { class: 'section-title' }, 'Boards'),
    el('div', { class: 'table-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, ['Board', 'Thick', 'Sheet L', 'Sheet W', `Low ${cur}`, `High ${cur}`, 'Grain', ''].map((h) => el('th', {}, h)))),
      el('tbody', {}, boards.map((m) => el('tr', {},
        el('td', { class: 'name' }, el('input', { value: m.name, style: { width: '170px', padding: '6px 8px', border: '1px solid var(--line)', borderRadius: '8px' }, onchange: (e) => { m.name = e.target.value; saveLib(); } }), m.note ? el('div', { class: 'muted tiny' }, m.note) : null),
        el('td', {}, num(m, 'T', { style: { width: '58px' } })), el('td', {}, num(m, 'sheetL', { style: { width: '74px' } })), el('td', {}, num(m, 'sheetW', { style: { width: '74px' } })),
        el('td', {}, num(m, 'price', { style: { width: '84px' } })), el('td', {}, num(m, 'priceHi', { style: { width: '84px' } })),
        el('td', {}, el('input', { type: 'checkbox', class: 'switch', checked: !!m.grain, 'aria-label': 'Has grain', onchange: (e) => { m.grain = e.target.checked; saveLib(); } })),
        el('td', {}, DEFAULT_MATERIALS.some((d) => d.id === m.id) ? '' : el('button', { class: 'btn small', type: 'button', onclick: () => { lib.materials = lib.materials.filter((x) => x !== m); saveLib(); renderMaterials(); } }, 'Delete'))))))),
    el('button', { class: 'btn small', type: 'button', style: { marginTop: '8px' }, onclick: () => { lib.materials.push({ id: 'm' + uid(), name: 'New board', kind: 'MDF', T: 18, sheetL: 2440, sheetW: 1220, price: 0, priceHi: 0, grain: false, region: rg }); saveLib(); renderMaterials(); } }, '+ Add a board'),
    el('h2', { class: 'section-title' }, 'Edge banding (per metre)'),
    el('div', { class: 'table-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, ['Edge band', 'Low', 'High'].map((h) => el('th', {}, h)))), el('tbody', {}, lib.edges.map((e) => el('tr', {}, el('td', { class: 'name' }, e.name), el('td', { class: 'num' }, num(e, 'price', { style: { width: '84px' } })), el('td', { class: 'num' }, num(e, 'priceHi', { style: { width: '84px' } }))))))),
    el('h2', { class: 'section-title' }, 'Hardware, steel & upholstery'),
    el('div', { class: 'table-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, ['Item', 'Per', 'Low', 'High'].map((h) => el('th', {}, h)))), el('tbody', {}, Object.values(lib.hardware).map((h) => el('tr', {}, el('td', { class: 'name' }, h.name), el('td', {}, h.unit === 'pcs' ? 'piece' : h.unit), el('td', { class: 'num' }, num(h, 'price', { style: { width: '84px' } })), el('td', { class: 'num' }, num(h, 'priceHi', { style: { width: '84px' } }))))))));
}

/* ================================================================ settings */
function renderSettings() {
  const s = lib.settings;
  const row = (label, input, help) => el('div', { class: 'field' }, el('span', {}, label), input, help ? el('div', { class: 'help' }, help) : null);
  const n = (k, attrs = {}) => el('input', { type: 'number', value: s[k], ...attrs, onchange: (e) => { s[k] = Number(e.target.value) || 0; saveLib(); } });
  const selI = (k, opts) => el('select', { onchange: (e) => { s[k] = e.target.value; saveLib(); } }, opts.map(([v, t]) => el('option', { value: v, selected: s[k] === v }, t)));
  $('#settings-body').replaceChildren(
    el('div', { class: 'form', style: { padding: 0 } }, el('details', { open: true }, el('summary', {}, 'Cutting'), el('div', { class: 'fields' },
      row('Units', selI('units', [['mm', 'Millimetres'], ['cm', 'Centimetres'], ['in', 'Inches']])),
      row('Saw blade width (kerf)', n('kerf', { step: 0.1 }), 'Lost to the saw at every cut. Usually 3–4.5 mm.'),
      row('Edge trim on each sheet', n('trim'), 'Factory edges are often chipped: trim them first.'),
      row('Default layout', selI('cutMode', [['strips', 'Easy cutting (strips)'], ['yield', 'Fewest sheets']])),
      row('Cut smaller for 2 mm banding', el('input', { type: 'checkbox', class: 'switch', checked: s.subtractThick, onchange: (e) => { s.subtractThick = e.target.checked; saveLib(); } }), 'Subtracts thick edge banding from the cut size so the finished part is exact.'),
      row('Extra banding per edge (mm)', n('edgeExtra')),
      row('Banding waste (%)', n('edgeWaste')))),
    el('details', { open: true }, el('summary', {}, 'Business'), el('div', { class: 'fields' },
      row('Workshop name', el('input', { type: 'text', value: s.shop, onchange: (e) => { s.shop = e.target.value; saveLib(); } }), 'Shown on cut lists, labels and quotes.'),
      row('Currency', el('input', { type: 'text', value: s.currency, onchange: (e) => { s.currency = e.target.value || 'ETB'; saveLib(); } })),
      row('Boards', selI('region', [['et', 'Ethiopia market'], ['std', 'Standard (international)']]), 'Which set of boards and prices designs use.'),
      row('Prices for quotes', selI('priceLevel', [['low', 'Lowest of the range'], ['mid', 'Middle of the range'], ['high', 'Highest of the range']])),
      row('Labour (% of materials)', n('labour')),
      row('Profit (%)', n('profit')))),
    el('details', {}, el('summary', {}, 'Back up or move to another phone'), el('div', { class: 'fields' },
      el('p', { class: 'muted tiny' }, 'Copy this text and keep it safe, or paste a backup and tap Import.'),
      (() => { const ta = el('textarea', { rows: 6, style: { width: '100%', fontFamily: 'monospace', fontSize: '.75rem', padding: '8px', border: '1px solid var(--line)', borderRadius: '10px' } }, JSON.stringify({ projects, library: { materials: lib.materials, edges: lib.edges, hardware: lib.hardware, settings: lib.settings, roles: lib.roles } }));
        return [ta, el('div', { class: 'row' },
          el('button', { class: 'btn small', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(ta.value); toast('Copied'); } catch { ta.select(); } } }, 'Copy'),
          el('button', { class: 'btn small', type: 'button', onclick: () => { try { const d = JSON.parse(ta.value); if (Array.isArray(d.projects)) { const ids = new Set(projects.map((x) => x.id)); for (const pr of d.projects) if (!ids.has(pr.id)) projects.push(pr); saveProjects(); } if (d.library) { saveLibrary(d.library); lib = loadLibrary(); } toast('Imported'); renderSettings(); } catch { toast('That isn’t an Anatsi backup.'); } } }, 'Import'))]; })()))),
    el('p', { class: 'muted tiny', style: { marginTop: '18px' } }, 'Anatsi is free and open source: no ads, no account, nothing locked. Everything stays on this phone.'));
}

/* ================================================================ start */
history.replaceState({ n: 0 }, '');
showTab('projects');
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
