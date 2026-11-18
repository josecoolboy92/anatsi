// Anatsi — furniture designer + cutting list for carpenters. No ads, no paywall, works offline.
import { $, el, toast, sheet, confirmBox, downloadBlob, storage, uid } from './util.js';
import { loadLibrary, saveLibrary, FINISHES, finishById, fmtLen, toMM, fromMM, matById, DEFAULT_MATERIALS } from './core.js';
import { MODELS, defaults, buildItem } from './models.js';
import { buildProject, cutList, edgeBanding, hardware, layoutSheets, costs } from './cut.js';
import { sheetSVG, ROLE_COLORS } from './diagram.js';

// replaceChildren that skips empty (null/false) entries and flattens arrays
const _rc = Element.prototype.replaceChildren;
Element.prototype.replaceChildren = function (...kids) { return _rc.apply(this, kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false)); };

let lib = loadLibrary();
let projects = storage.get('anatsi.projects', []);
const saveProjects = () => storage.set('anatsi.projects', projects);
const saveLib = () => saveLibrary({ materials: lib.materials, edges: lib.edges, hardware: lib.hardware, settings: lib.settings });
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
  { label: 'Hotel room set', icon: '🏨', sub: 'Queen bed, nightstands, wardrobe', make: () => [newItem('bed', { name: 'Queen bed', params: MODELS.bed.presets['Hotel queen (1600×2000)'] }), newItem('cupboard', { name: 'Wardrobe', params: MODELS.cupboard.presets['Hotel wardrobe 900'] })] },
  { label: 'Joinable twin beds', icon: '🛏️', sub: '2 twins that make a king', make: () => [newItem('bed', { name: 'Twin beds', params: MODELS.bed.presets['Joinable twins → king (2× 900×2000)'] })] },
  { label: 'Wardrobe', icon: '🚪', sub: 'Doors, shelves, rail', make: () => [newItem('cupboard', { name: 'Wardrobe', params: MODELS.cupboard.presets['Wardrobe 3-door 1500'] })] },
  { label: 'Bookcase / cupboard', icon: '📚', sub: 'Open or closed', make: () => [newItem('cupboard', { name: 'Bookcase', params: MODELS.cupboard.presets['Bookcase open'] })] },
  { label: 'Cutting list only', icon: '📐', sub: 'Type in your parts', make: () => [newItem('custom', { name: 'My parts' })] },
];

function renderProjects() {
  $('#quick').replaceChildren(...QUICK.map((q) => el('button', { class: 'quick', type: 'button', onclick: () => {
    const p = newProject(q.label);
    p.items.push(...q.make());
    saveProjects();
    openProject(p);
    if (p.items.length === 1) setTimeout(() => openItem(p, p.items[0]), 60);
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
function openProject(p) {
  const host = $('#layer-project');
  let current = 'items';
  let viewer = null;
  const nameBtn = el('button', { class: 'name', type: 'button' }, p.name);
  nameBtn.addEventListener('click', async () => { const n = await ask('Rename project', '', p.name); if (n) { p.name = n; nameBtn.textContent = n; touch(); } });
  const tabsBar = el('div', { class: 'layer-tabs', role: 'tablist' });
  const body = el('div', { class: 'layer-body' });
  const TABS = [['items', 'Furniture'], ['3d', '3D'], ['cut', 'Cut list'], ['sheets', 'Sheets'], ['cost', 'Cost']];
  const touch = () => { p.updated = Date.now(); saveProjects(); };

  const show = (t) => {
    current = t;
    tabsBar.querySelectorAll('button').forEach((b) => (b.dataset.t === t ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
    if (viewer) { viewer.destroy(); viewer = null; }
    body.scrollTop = 0;
    ({ items: renderItems, '3d': render3D, cut: renderCut, sheets: renderSheets, cost: renderCost })[t]();
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
    const box = el('div', { class: 'view3d', style: { height: 'calc(100dvh - 120px)' } });
    const info = el('div', { class: 'pick-info', hidden: true });
    const tools = viewTools(() => viewer);
    box.append(info, tools);
    body.replaceChildren(box);
    viewer = await makeViewer(box, { onPick: (pn) => showPick(info, pn) });
    if (!viewer) return;
    const groups = [];
    let cursor = 0;
    for (const it of p.items) {
      try {
        const out = buildItem(it, lib);
        const ox = cursor - (out.offsetX || 0);
        groups.push({ out, offset: [ox, 0, 0] });
        cursor += out.size.w + 700;
      } catch { /* skip broken item */ }
    }
    viewer.setModel(groups);
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
      const inp = el('input', { class: 'price-in', type: 'number', min: 0, step: 'any', value: line.price || '', placeholder: '0', 'aria-label': `Price for ${line.label}` });
      inp.addEventListener('change', () => {
        const v = Number(inp.value) || 0;
        // write the price back to the library
        const mat = layouts.find((l) => `${l.material.name} · ${finishById(l.color).name}` === line.label);
        if (mat) mat.material.price = v;
        const edge = lib.edges.find((e) => line.label.startsWith(e.name));
        if (edge) edge.price = v;
        const h = Object.values(lib.hardware).find((x) => x.name === line.label);
        if (h) h.price = v;
        if (mat) { const m2 = lib.materials.find((x) => x.id === mat.material.id); if (m2) m2.price = v; }
        saveLib();
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
  show('items');
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
      msgs.replaceChildren(
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

  function renderForm() {
    const sections = [];
    for (const f of model.params) {
      if (!sections.includes(f.section || 'Settings')) sections.push(f.section || 'Settings');
    }
    form.replaceChildren(...sections.map((sec, i) => {
      const fields = model.params.filter((f) => (f.section || 'Settings') === sec && (!f.when || f.when(item.params)));
      if (!fields.length) return null;
      return el('details', { open: i === 0 }, el('summary', {}, sec), el('div', { class: 'fields' }, fields.map((f) => fieldRow(f, item.params[f.k], (v, how = {}) => {
        item.params[f.k] = v;
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
    input = el('select', { 'aria-label': f.label, onchange: (e) => onChange(e.target.value, { rerender: true }) }, f.opts.map(([v, t]) => el('option', { value: v, selected: String(value) === String(v) }, t)));
  } else if (f.type === 'bool') {
    input = el('input', { type: 'checkbox', class: 'switch', checked: !!value, 'aria-label': f.label, onchange: (e) => onChange(e.target.checked, { rerender: true }) });
  } else if (f.type === 'mat') {
    input = el('select', { 'aria-label': f.label, onchange: (e) => onChange(e.target.value, { rerender: true }) }, lib.materials.map((m) => el('option', { value: m.id, selected: value === m.id }, m.name)));
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
  const num = (obj, key, attrs = {}) => el('input', { class: 'price-in', type: 'number', step: 'any', value: obj[key] ?? '', ...attrs, onchange: (e) => { obj[key] = Number(e.target.value) || 0; saveLib(); } });
  body.replaceChildren(
    el('p', { class: 'muted' }, `Prices are saved on this phone and used for every project's cost (${cur}). Sheet sizes are used for cutting.`),
    el('h2', { class: 'section-title' }, 'Boards'),
    el('div', { class: 'table-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, ['Board', 'Thick', 'Sheet L', 'Sheet W', 'Trim', `Price / sheet`, 'Grain', ''].map((h) => el('th', {}, h)))),
      el('tbody', {}, lib.materials.map((m) => el('tr', {},
        el('td', { class: 'name' }, el('input', { value: m.name, style: { width: '170px', padding: '6px 8px', border: '1px solid var(--line)', borderRadius: '8px' }, onchange: (e) => { m.name = e.target.value; saveLib(); } })),
        el('td', {}, num(m, 'T', { style: { width: '64px' } })), el('td', {}, num(m, 'sheetL', { style: { width: '80px' } })), el('td', {}, num(m, 'sheetW', { style: { width: '80px' } })),
        el('td', {}, el('input', { class: 'price-in', type: 'number', style: { width: '64px' }, value: m.trim ?? '', placeholder: String(lib.settings.trim), onchange: (e) => { m.trim = e.target.value === '' ? undefined : Number(e.target.value); saveLib(); } })),
        el('td', {}, num(m, 'price')),
        el('td', {}, el('input', { type: 'checkbox', class: 'switch', checked: !!m.grain, 'aria-label': 'Has grain', onchange: (e) => { m.grain = e.target.checked; saveLib(); } })),
        el('td', {}, DEFAULT_MATERIALS.some((d) => d.id === m.id) ? '' : el('button', { class: 'btn small', type: 'button', onclick: () => { lib.materials = lib.materials.filter((x) => x !== m); saveLib(); renderMaterials(); } }, 'Delete'))))))),
    el('button', { class: 'btn small', type: 'button', style: { marginTop: '8px' }, onclick: () => { lib.materials.push({ id: 'm' + uid(), name: 'New board', kind: 'MDF', T: 18, sheetL: 2440, sheetW: 1220, price: 0, grain: false }); saveLib(); renderMaterials(); } }, '+ Add a board'),
    el('h2', { class: 'section-title' }, 'Edge banding (per metre)'),
    el('div', { class: 'table-wrap' }, el('table', {}, el('tbody', {}, lib.edges.map((e) => el('tr', {}, el('td', { class: 'name' }, e.name), el('td', { class: 'num' }, num(e, 'price'))))))),
    el('h2', { class: 'section-title' }, 'Hardware & other'),
    el('div', { class: 'table-wrap' }, el('table', {}, el('tbody', {}, Object.values(lib.hardware).map((h) => el('tr', {}, el('td', { class: 'name' }, h.name), el('td', {}, `per ${h.unit === 'pcs' ? 'piece' : h.unit}`), el('td', { class: 'num' }, num(h, 'price'))))))));
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
      row('Labour (% of materials)', n('labour')),
      row('Profit (%)', n('profit')))),
    el('details', {}, el('summary', {}, 'Back up or move to another phone'), el('div', { class: 'fields' },
      el('p', { class: 'muted tiny' }, 'Copy this text and keep it safe, or paste a backup and tap Import.'),
      (() => { const ta = el('textarea', { rows: 6, style: { width: '100%', fontFamily: 'monospace', fontSize: '.75rem', padding: '8px', border: '1px solid var(--line)', borderRadius: '10px' } }, JSON.stringify({ projects, library: { materials: lib.materials, edges: lib.edges, hardware: lib.hardware, settings: lib.settings } }));
        return [ta, el('div', { class: 'row' },
          el('button', { class: 'btn small', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(ta.value); toast('Copied'); } catch { ta.select(); } } }, 'Copy'),
          el('button', { class: 'btn small', type: 'button', onclick: () => { try { const d = JSON.parse(ta.value); if (Array.isArray(d.projects)) { const ids = new Set(projects.map((x) => x.id)); for (const pr of d.projects) if (!ids.has(pr.id)) projects.push(pr); saveProjects(); } if (d.library) { saveLibrary(d.library); lib = loadLibrary(); } toast('Imported'); renderSettings(); } catch { toast('That isn’t an Anatsi backup.'); } } }, 'Import'))]; })()))),
    el('p', { class: 'muted tiny', style: { marginTop: '18px' } }, 'Anatsi is free and open source: no ads, no account, nothing locked. Everything stays on this phone.'));
}

/* ================================================================ start */
history.replaceState({ n: 0 }, '');
showTab('projects');
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
